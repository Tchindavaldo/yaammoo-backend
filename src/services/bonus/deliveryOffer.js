// ============================================================================
// deliveryOffer — Offre de livraison applicable, forme unique et partagée
// ============================================================================
// Un SEUL objet `deliveryOffer` circule dans toute l'API (GET /fastfood/all,
// commandes). Il porte des DONNÉES, jamais une consigne d'affichage : le front
// décide seul du rendu (prix barré, libellé…).
//
// ⚠️ Les prix de livraison sont TOUJOURS renvoyés normaux, jamais à 0.
// `deliveryOffer` dit seulement que la livraison est offerte, et pourquoi.
//
// Qui y renonce (`coveredBy`) :
//   • bonus de boutique (fastFoodId) → 'fastfood' : le marchand offre sa course
//   • bonus plateforme (fastFoodId null) → 'platform' : Yaammoo renonce à sa
//     marge livraison (la marge plat, elle, est conservée)
// ============================================================================

const { deriveRequestState, computeExpiresAt } = require('./enrichBonusForUser');

// Type de bonus ouvrant droit à la livraison offerte. Les autres types
// (netflix, free_meal…) ne s'arment pas : l'armement n'a de sens que pour un
// avantage appliqué automatiquement au passage de commande.
const FREE_DELIVERY_TYPE = 'free_delivery';

// Motifs possibles d'une offre. `campaign` (mode gratuité globale) est produit
// par la tarification livraison, pas ici.
const OFFER_REASON_BONUS = 'bonus';

/** Un bonus de boutique ne vaut que chez elle ; un bonus plateforme vaut partout. */
function matchesFastFood(bonus, fastFoodId) {
  if (!bonus) return false;
  if (bonus.fastFoodId == null) return true;
  return !!fastFoodId && bonus.fastFoodId === fastFoodId;
}

/** Qui renonce au montant de la livraison. */
function resolveCoveredBy(bonus) {
  return bonus && bonus.fastFoodId != null ? 'fastfood' : 'platform';
}

/**
 * Le bonus + sa réclamation ouvrent-ils droit à la livraison offerte ?
 * Contrôles communs à la vérification (lecture seule) et à la consommation.
 *
 * @returns {{usable:boolean, reason?:string, state?:object, expiresAt?:string|null, remainingUses?:number|null}}
 */
function checkDeliveryBonusUsable(bonus, request, { fastFoodId, now = new Date() } = {}) {
  if (!bonus) return { usable: false, reason: 'bonus_not_found' };
  if (bonus.active === false) return { usable: false, reason: 'bonus_inactive' };
  if (bonus.type !== FREE_DELIVERY_TYPE) return { usable: false, reason: 'bonus_not_free_delivery' };
  if (!request) return { usable: false, reason: 'not_claimed' };

  const state = deriveRequestState(request);
  if (state.requestStatus !== 'approved') return { usable: false, reason: 'not_claimed' };

  const expiresAt = computeExpiresAt(state.claimedAt, bonus.claimDuration);
  if (expiresAt && new Date(expiresAt) < now) return { usable: false, reason: 'expired', expiresAt };

  const usageLimit = bonus.usageLimit != null ? Number(bonus.usageLimit) : null;
  const remainingUses = usageLimit != null ? Math.max(0, usageLimit - state.usageCount) : null;
  if (state.redeemed || remainingUses === 0) return { usable: false, reason: 'exhausted', expiresAt, remainingUses: 0 };

  // Le contrôle de boutique n'est fait que si un fastfood est visé : la simple
  // vérification d'un code (sans contexte de commande) doit rester possible.
  if (fastFoodId !== undefined && !matchesFastFood(bonus, fastFoodId)) {
    return { usable: false, reason: 'wrong_fastfood', expiresAt, remainingUses };
  }

  return { usable: true, state, expiresAt, remainingUses };
}

/**
 * Construit l'objet exposé au front. `null` quand aucune offre ne s'applique —
 * le front n'a alors rien à afficher de particulier.
 */
function buildDeliveryOffer(bonus, request, { reason = OFFER_REASON_BONUS } = {}) {
  if (!bonus) return null;
  const state = deriveRequestState(request);
  return {
    active: true,
    reason,
    coveredBy: resolveCoveredBy(bonus),
    bonusId: bonus.id,
    bonusCode: state.code,
    bonusName: bonus.name ?? null,
    fastFoodId: bonus.fastFoodId ?? null,
  };
}

// Messages destinés au user, dérivés du motif technique.
const REASON_MESSAGES = {
  bonus_not_found: 'Bonus non trouvé.',
  bonus_inactive: "Ce bonus n'est pas actif.",
  bonus_not_free_delivery: "Ce bonus ne donne pas droit à la livraison offerte.",
  not_claimed: "Ce bonus n'a pas été réclamé.",
  expired: 'Ce code a expiré.',
  exhausted: 'Ce code a déjà été entièrement consommé.',
  wrong_fastfood: "Ce bonus n'est pas valable dans cette boutique.",
  code_not_found: 'Code bonus introuvable.',
};

function messageForReason(reason) {
  return REASON_MESSAGES[reason] || 'Bonus non utilisable.';
}

module.exports = {
  FREE_DELIVERY_TYPE,
  OFFER_REASON_BONUS,
  matchesFastFood,
  resolveCoveredBy,
  checkDeliveryBonusUsable,
  buildDeliveryOffer,
  messageForReason,
};
