// ============================================================================
// applyDeliveryBonus — Résolution puis consommation d'un bonus à la commande
// ============================================================================
// C'est le SEUL endroit où une utilisation est consommée par le flux commande.
// Le front ne décide de rien : il annonce un code (ou rien du tout), le backend
// rejoue tous les contrôles.
//
// Deux temps, volontairement séparés :
//   1. resolve — AVANT la création de la commande : un code invalide doit la
//      faire échouer en 400, pas laisser passer une commande à demi-traitée.
//   2. consume — APRÈS création réussie : pas de commande = pas de consommation.
//      C'est toute la raison d'être du découpage (le user peut quitter l'écran
//      de commande sans rien perdre).
//
// ⚠️ Aucun prix n'est modifié ici : les montants de livraison restent normaux.
// L'objet `deliveryOffer` dit seulement que la livraison est offerte.
// ============================================================================
const repos = require('../../repositories');
const { normalizeBonusCode } = require('./bonusCode.util');
const { checkDeliveryBonusUsable, buildDeliveryOffer, messageForReason } = require('./deliveryOffer');
const { getArmedDeliveryOffers, pickOfferForFastFood } = require('./armBonus.service');

const LOYALTY_TYPE = 'loyalty';

/**
 * Détermine le bonus livraison applicable à une commande.
 *
 * Priorité : le code explicitement envoyé par le front (armement local depuis
 * l'écran de commande, ou code d'un tiers) ; à défaut, l'armement global du user.
 *
 * @returns {Promise<{error?:string, reason?:string, bonus?:object, request?:object, offer?:object}|null>}
 *   `null` = aucun bonus à appliquer (cas nominal, pas une erreur).
 */
exports.resolveDeliveryBonus = async ({ userId, fastFoodId, bonusCode }) => {
  const code = normalizeBonusCode(bonusCode);

  if (code) {
    const request = await repos.bonusRequests.findByCode(code, LOYALTY_TYPE);
    // Un code explicitement fourni et invalide est une ERREUR : le user croit
    // bénéficier de la gratuité, on ne peut pas l'ignorer silencieusement.
    if (!request) return { error: messageForReason('code_not_found'), reason: 'code_not_found' };

    const bonus = await repos.bonus.getById(request.bonusId);
    const check = checkDeliveryBonusUsable(bonus, request, { fastFoodId });
    if (!check.usable) return { error: messageForReason(check.reason), reason: check.reason };

    return { bonus, request, offer: buildDeliveryOffer(bonus, request) };
  }

  // Aucun code : on retombe sur l'armement global (page bonus). Son absence est
  // parfaitement normale — la commande se passe simplement sans bonus.
  if (!userId) return null;
  const offers = await getArmedDeliveryOffers(userId);
  const offer = pickOfferForFastFood(offers, fastFoodId);
  if (!offer) return null;

  const request = await repos.bonusRequests.findByUserBonus({ userId, bonusId: offer.bonusId, bonusType: LOYALTY_TYPE });
  const bonus = await repos.bonus.getById(offer.bonusId);
  if (!request || !bonus) return null;

  return { bonus, request, offer };
};

/**
 * Consomme une utilisation, après création effective de la commande.
 * Non bloquant : la commande existe déjà, une erreur ici ne doit pas la casser.
 *
 * @returns {Promise<object|null>} l'offre enrichie de l'état post-consommation
 */
exports.consumeDeliveryBonus = async ({ bonus, request, offer, orderId }) => {
  if (!bonus || !request) return null;
  try {
    const usageLimit = bonus.usageLimit != null ? Number(bonus.usageLimit) : null;
    const usageCount = (request.usageCount || 0) + 1;
    const redeemed = usageLimit != null ? usageCount >= usageLimit : false;

    // Désarmement systématique : l'armement vaut pour UNE commande. S'il reste
    // des utilisations, le user ré-arme explicitement — sinon un bonus armé
    // s'appliquerait à son insu à toutes ses commandes suivantes.
    const fields = { usageCount, redeemed, armed: false };
    if (orderId) fields.lastOrderId = orderId;

    await repos.bonusRequests.updateUsage(request.id, fields);

    return {
      ...offer,
      usageCount,
      remainingUses: usageLimit != null ? Math.max(0, usageLimit - usageCount) : null,
      redeemed,
    };
  } catch (error) {
    console.error('consumeDeliveryBonus: consommation échouée (commande conservée):', error.message);
    return offer;
  }
};
