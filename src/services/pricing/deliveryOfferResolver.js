// ============================================================================
// deliveryOfferResolver — Arbitrage entre campagne globale et bonus du user
// ============================================================================
// Deux sources peuvent rendre la livraison offerte :
//   • une CAMPAGNE plateforme (`delivery_free_mode`, table settings)
//   • un BONUS du user (armé, ou code présenté)
//
// Règle : **la campagne PRIME, et le bonus n'est alors PAS consommé.**
// Sinon on brûlerait le bonus d'un user pendant une période où la livraison
// était de toute façon gratuite pour tout le monde — il le vivrait très mal.
//
// Un seul motif est renvoyé à la fois : le champ `deliveryOffer` n'a qu'une
// `reason`, ce qui évite au front d'avoir à arbitrer lui-même.
// ============================================================================

const OFFER_REASON_CAMPAIGN = 'campaign';

/** Offre issue d'une campagne globale : c'est la plateforme qui renonce à sa marge. */
function buildCampaignOffer() {
  return {
    active: true,
    reason: OFFER_REASON_CAMPAIGN,
    coveredBy: 'platform',
    bonusId: null,
    bonusCode: null,
    bonusName: null,
    fastFoodId: null,
  };
}

/**
 * @param {boolean} deliveryFreeMode campagne active ?
 * @param {Object|null} bonusOffer   offre issue d'un bonus du user
 * @returns {{offer: Object|null, consumeBonus: boolean}}
 *   `consumeBonus` est faux dès qu'une campagne couvre déjà la livraison.
 */
function resolveOffer(deliveryFreeMode, bonusOffer) {
  if (deliveryFreeMode) return { offer: buildCampaignOffer(), consumeBonus: false };
  if (bonusOffer) return { offer: bonusOffer, consumeBonus: true };
  return { offer: null, consumeBonus: false };
}

module.exports = { OFFER_REASON_CAMPAIGN, buildCampaignOffer, resolveOffer };
