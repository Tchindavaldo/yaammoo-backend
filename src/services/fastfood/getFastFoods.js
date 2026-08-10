// ============================================================================
// getFastFoodsService — Liste des boutiques, enrichie pour l'appelant
// ============================================================================
// Prix : TOUJOURS le prix affiché (plat + livraison la plus chère + marge, le
// tout majoré des frais), pour TOUS les appelants. Cette route alimente le home,
// donc un écran d'achat : le propriétaire d'une boutique qui y commande paie le
// même prix que n'importe qui. Sa gestion de catalogue passe par
// `GET /menu/:fastFoodId`, qui sert les prix bruts.
//
// Un seul enrichissement dépend de QUI appelle :
//   • `deliveryOffer` — offre de livraison applicable au user courant.
// ============================================================================
const repos = require('../../repositories');
const { getMenuService } = require('../menu/getMenu.services');
const { getArmedDeliveryOffers, pickOfferForFastFood } = require('../bonus/armBonus.service');
const { getPricingSettings } = require('../settings/settings.service');
const { applyDisplayPricing, isPlatformDelivered } = require('../pricing/deliveryPricing');
const { buildCampaignOffer } = require('../pricing/deliveryOfferResolver');
const { platformMinItems } = require('../bonus/deliveryOfferAffordability');

/**
 * @param {string} [userId] uid du user courant (auth FACULTATIVE sur cette route).
 *   Fourni, chaque boutique porte l'offre de livraison applicable à CE user.
 */
exports.getFastFoodsService = async userId => {
  try {
    const fastfoods = await repos.fastfoods.getAll();
    if (!fastfoods || fastfoods.length === 0) return [];

    // Une seule lecture des bonus armés et des réglages pour toute la liste
    // (pas de N+1).
    const [offers, pricing] = await Promise.all([getArmedDeliveryOffers(userId), getPricingSettings()]);

    // Campagne globale : elle PRIME sur les bonus et s'applique à tout le monde,
    // y compris aux visiteurs non connectés.
    //
    // ⚠️ Réservée au régime PLATEFORME — en fastfood la course est facturée à
    // part, l'offrir sortirait réellement de la caisse. Elle porte donc son
    // `minItems` : ne passant pas par `POST /bonus/verify`, c'est le seul moyen
    // pour le front de connaître le seuil avant le paiement.
    const campaignOffer = pricing.deliveryFreeMode ? buildCampaignOffer(platformMinItems(pricing, 'campaign')) : null;

    // [TEMP-LOG] à retirer
    console.log('[FFALL] userId=%s campaign=%s byFastFood=%j platform=%s', userId || '(anonyme)', !!campaignOffer, Object.keys(offers.byFastFood || {}), !!offers.platform);

    const fastfoodsWithMenus = await Promise.all(
      fastfoods.map(async fastfood => {
        const menus = await getMenuService(fastfood.id);
        // Prix AFFICHÉ pour tout le monde, y compris le propriétaire de la
        // boutique : `/fastfood/all` alimente le HOME, donc un écran d'achat.
        // Un marchand qui commande y est un client comme un autre — lui servir
        // ses prix réels afficherait un prix qu'il ne paierait pas.
        // Sa gestion de catalogue passe par `GET /menu/:fastFoodId`, qui sert
        // les prix bruts.
        const priced = applyDisplayPricing({ ...fastfood, menus }, pricing, false);
        // La campagne ne vaut que chez les boutiques livrées par la plateforme ;
        // ailleurs on retombe sur l'éventuel bonus armé du user.
        const campaign = campaignOffer && isPlatformDelivered(fastfood) ? campaignOffer : null;
        return {
          ...priced,
          deliveryOffer: campaign || pickOfferForFastFood(offers, fastfood.id),
        };
      })
    );

    return fastfoodsWithMenus.filter(f => Array.isArray(f.menus) && f.menus.length > 0);
  } catch (error) {
    console.error('Erreur dans getFastfoods:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
