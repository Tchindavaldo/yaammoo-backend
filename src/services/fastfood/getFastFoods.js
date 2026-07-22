// ============================================================================
// getFastFoodsService — Liste des boutiques, enrichie pour l'appelant
// ============================================================================
// Deux enrichissements dépendant de QUI appelle :
//   • `pricing` / prix affichés — le client voit prix plat + livraison la plus
//     chère + marge ; le MARCHAND PROPRIÉTAIRE voit ses prix réels, sinon il ne
//     pourrait plus gérer son catalogue.
//   • `deliveryOffer` — offre de livraison applicable au user courant.
// ============================================================================
const repos = require('../../repositories');
const { getMenuService } = require('../menu/getMenu.services');
const { getArmedDeliveryOffers, pickOfferForFastFood } = require('../bonus/armBonus.service');
const { getPricingSettings } = require('../settings/settings.service');
const { applyDisplayPricing } = require('../pricing/deliveryPricing');
const { buildCampaignOffer } = require('../pricing/deliveryOfferResolver');

/**
 * @param {string} [userId] uid du user courant (auth FACULTATIVE sur cette route).
 *   Fourni, chaque boutique porte l'offre de livraison applicable à CE user, et
 *   le propriétaire d'une boutique en voit les prix réels.
 */
exports.getFastFoodsService = async (userId) => {
  try {
    const fastfoods = await repos.fastfoods.getAll();
    if (!fastfoods || fastfoods.length === 0) return [];

    // Une seule lecture des bonus armés et des réglages pour toute la liste
    // (pas de N+1).
    const [offers, pricing] = await Promise.all([getArmedDeliveryOffers(userId), getPricingSettings()]);

    // Campagne globale : elle PRIME sur les bonus et s'applique à tout le monde,
    // y compris aux visiteurs non connectés.
    const campaignOffer = pricing.deliveryFreeMode ? buildCampaignOffer() : null;

    const fastfoodsWithMenus = await Promise.all(
      fastfoods.map(async (fastfood) => {
        const menus = await getMenuService(fastfood.id);
        const isOwner = !!userId && fastfood.userId === userId;
        const priced = applyDisplayPricing({ ...fastfood, menus }, pricing.platformMargin, isOwner);
        return {
          ...priced,
          deliveryOffer: campaignOffer || pickOfferForFastFood(offers, fastfood.id),
        };
      })
    );

    return fastfoodsWithMenus.filter(
      (f) => Array.isArray(f.menus) && f.menus.length > 0
    );
  } catch (error) {
    console.error('Erreur dans getFastfoods:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
