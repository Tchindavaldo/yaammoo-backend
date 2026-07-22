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
// ============================================================================
const repos = require('../../repositories');
const { checkDeliveryBonusUsable, buildDeliveryOffer, messageForReason, matchesFastFood } = require('./deliveryOffer');

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

    return {
      success: true,
      status: 200,
      message: armed ? 'Bonus armé.' : 'Bonus désarmé.',
      data: {
        bonusId,
        armed: !!armed,
        // Désarmés par recouvrement : le front peut mettre son état à jour sans re-GET.
        disarmedBonusIds: disarmed,
        deliveryOffer: armed ? buildDeliveryOffer(bonus, saved) : null,
      },
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
  if (armedRequests.length === 0) return empty;

  const result = { byFastFood: {}, platform: null };
  for (const request of armedRequests) {
    const bonus = await repos.bonus.getById(request.bonusId);
    // Un bonus armé puis expiré/épuisé reste armé en base : on ne l'expose pas.
    if (!checkDeliveryBonusUsable(bonus, request).usable) continue;

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
