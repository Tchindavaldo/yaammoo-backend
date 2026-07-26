// ============================================================================
// armBonusService — Armement/désarmement d'un bonus livraison offerte
// ============================================================================
// « Armer » = le user déclare depuis sa page bonus que ce bonus doit s'appliquer
// à sa prochaine commande éligible. Persisté (colonne `armed`, migration 018)
// pour survivre à la fermeture de l'app : au retour, GET /fastfood/all sait où
// la livraison est offerte.
//
// ⚠️ Armer ne consomme AUCUNE utilisation. La consommation n'a lieu qu'à la
// création effective d'une commande (cf. applyDeliveryBonus).
//
// Exclusivité : deux bonus armés qui se recouvrent (même boutique, ou l'un des
// deux plateforme) rendraient l'offre ambiguë. On désarme donc les recouvrants.
//
// Sockets : `bonus.armed` / `bonus.disarmed` (room `<userId>`), via reliableEmit
// (persisté + rejoué au join_user). L'appareil appelant est déjà à jour par la
// réponse HTTP — les events existent pour les AUTRES appareils du user, qui
// sinon afficheraient un armement périmé, y compris après une période hors ligne.
// ============================================================================
const repos = require('../../repositories');
const { checkDeliveryBonusUsable, buildDeliveryOffer, messageForReason, matchesFastFood } = require('./deliveryOffer');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

const LOYALTY_TYPE = 'loyalty';

/** Deux bonus se recouvrent si l'un est plateforme, ou s'ils visent la même boutique. */
function overlaps(a, b) {
  if (!a || !b) return false;
  if (a.fastFoodId == null || b.fastFoodId == null) return true;
  return a.fastFoodId === b.fastFoodId;
}

/**
 * @param {string}  userId  uid du user courant
 * @param {string}  bonusId bonus à armer/désarmer
 * @param {boolean} armed   true = armer, false = désarmer
 */
exports.armBonusService = async (userId, bonusId, armed) => {
  try {
    if (!userId) return { success: false, status: 401, message: 'Utilisateur non authentifié.' };
    if (!bonusId) return { success: false, status: 400, message: 'bonusId requis.' };

    const bonus = await repos.bonus.getById(bonusId);
    if (!bonus) return { success: false, status: 404, message: 'Bonus non trouvé.' };

    const request = await repos.bonusRequests.findByUserBonus({ userId, bonusId, bonusType: LOYALTY_TYPE });
    if (!request) return { success: false, status: 404, message: "Ce bonus n'a pas été réclamé." };

    // Désarmer est toujours permis : un bonus expiré ou épuisé doit pouvoir être
    // nettoyé, sinon il resterait armé sans jamais pouvoir servir.
    if (armed) {
      const check = checkDeliveryBonusUsable(bonus, request);
      if (!check.usable) {
        return { success: false, status: check.reason === 'bonus_not_found' ? 404 : 400, message: messageForReason(check.reason), data: { reason: check.reason } };
      }
    }

    const saved = await repos.bonusRequests.updateUsage(request.id, { armed: !!armed });

    // [TEMP-LOG] à retirer
    console.log('[ARM] userId=%s bonusId=%s type=%s ffId=%s | requestId=%s -> armed(saved)=%s extraArmed=%s', userId, bonusId, bonus.type, bonus.fastFoodId, request.id, saved?.armed, saved?.extraData?.armed);

    // Exclusivité : on désarme les autres bonus armés qui se recouvrent.
    let disarmed = [];
    if (armed) {
      const others = (await repos.bonusRequests.getArmedByUser(userId)).filter(r => r.id !== saved.id);
      for (const other of others) {
        const otherBonus = await repos.bonus.getById(other.bonusId);
        if (!overlaps(bonus, otherBonus)) continue;
        await repos.bonusRequests.updateUsage(other.id, { armed: false });
        disarmed.push(other.bonusId);
      }
    }

    const armState = {
      bonusId,
      armed: !!armed,
      // Désarmés par recouvrement : le front peut mettre son état à jour sans re-GET.
      disarmedBonusIds: disarmed,
      deliveryOffer: armed ? buildDeliveryOffer(bonus, saved) : null,
    };

    // Room nommée par l'uid, sans préfixe (cf. CLAUDE.md / socket.js).
    // Même payload que la réponse HTTP : l'appareil qui a armé est déjà à jour
    // par le retour de la requête ; le socket sert aux AUTRES appareils du user,
    // qui sinon garderaient un état d'armement périmé.
    //
    // reliableEmit (et non un emit nu) : un appareil hors ligne au moment de
    // l'armement doit retrouver l'état au retour, sinon il proposerait encore
    // une livraison offerte déjà désarmée ailleurs. Rejeu au prochain join_user.
    try {
      await reliableEmit(getIO(), userId, armed ? 'bonus.armed' : 'bonus.disarmed', { data: armState });
    } catch (err) {
      console.error('armBonus: émission socket échouée (non bloquant):', err.message);
    }

    return {
      success: true,
      status: 200,
      message: armed ? 'Bonus armé.' : 'Bonus désarmé.',
      data: armState,
    };
  } catch (error) {
    console.error('Erreur dans armBonusService:', error);
    return { success: false, status: 500, message: error.message || "Erreur serveur lors de l'armement." };
  }
};

/**
 * Offres de livraison actives d'un user, indexées par fastFoodId.
 * Une seule lecture pour toute une liste de boutiques (pas de N+1).
 *
 * @returns {Promise<{byFastFood: Object, platform: Object|null}>}
 *   `platform` s'applique à TOUTES les boutiques ; `byFastFood` prime sur lui.
 */
exports.getArmedDeliveryOffers = async userId => {
  const empty = { byFastFood: {}, platform: null };
  if (!userId) return empty;

  const armedRequests = await repos.bonusRequests.getArmedByUser(userId);
  // [TEMP-LOG] à retirer
  console.log('[OFFERS] userId=%s armedRequests=%d ids=%j', userId, armedRequests.length, armedRequests.map(r => r.bonusId));
  if (armedRequests.length === 0) return empty;

  const result = { byFastFood: {}, platform: null };
  for (const request of armedRequests) {
    const bonus = await repos.bonus.getById(request.bonusId);
    // Un bonus armé puis expiré/épuisé reste armé en base : on ne l'expose pas.
    const check = checkDeliveryBonusUsable(bonus, request);
    // [TEMP-LOG] à retirer
    console.log('[OFFERS] bonusId=%s type=%s ffId=%s active=%s | usable=%s reason=%s', request.bonusId, bonus?.type, bonus?.fastFoodId, bonus?.active, check.usable, check.reason);
    if (!check.usable) continue;

    const offer = buildDeliveryOffer(bonus, request);
    if (bonus.fastFoodId == null) result.platform = offer;
    else result.byFastFood[bonus.fastFoodId] = offer;
  }
  return result;
};

/** Offre applicable à une boutique donnée (boutique prioritaire sur plateforme). */
exports.pickOfferForFastFood = (offers, fastFoodId) => {
  if (!offers) return null;
  return offers.byFastFood?.[fastFoodId] || offers.platform || null;
};

exports.overlaps = overlaps;
exports.matchesFastFood = matchesFastFood;
