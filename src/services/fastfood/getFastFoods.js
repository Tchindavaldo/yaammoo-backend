// ============================================================================
// getFastFoodsService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getMenuService } = require('../menu/getMenu.services');
const { getArmedDeliveryOffers, pickOfferForFastFood } = require('../bonus/armBonus.service');

/**
 * @param {string} [userId] uid du user courant (auth FACULTATIVE sur cette route).
 *   Fourni, chaque boutique porte l'offre de livraison applicable à CE user.
 */
exports.getFastFoodsService = async (userId) => {
  try {
    const fastfoods = await repos.fastfoods.getAll();
    if (!fastfoods || fastfoods.length === 0) return [];

    // Une seule lecture des bonus armés pour toute la liste (pas de N+1).
    const offers = await getArmedDeliveryOffers(userId);

    const fastfoodsWithMenus = await Promise.all(
      fastfoods.map(async (fastfood) => {
        const menus = await getMenuService(fastfood.id);
        return { ...fastfood, menus, deliveryOffer: pickOfferForFastFood(offers, fastfood.id) };
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
