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
const { withMenuThumbnails, withFastfoodThumbnail } = require('../images/thumbnailUrl');
const { buildCampaignOffer } = require('../pricing/deliveryOfferResolver');
const { platformMinItems } = require('../bonus/deliveryOfferAffordability');

/**
 * @param {string} [userId] uid du user courant (auth FACULTATIVE sur cette route).
 *   Fourni, chaque boutique porte l'offre de livraison applicable à CE user.
 * @param {Object} [page] pagination par curseur. ABSENT = catalogue complet
 *   (comportement historique, indispensable aux apps déjà installées qui ne
 *   connaissent pas la pagination).
 * @param {number} [page.limit] taille de page — c'est sa présence qui active la
 *   pagination.
 * @param {string} [page.cursor] curseur renvoyé par l'appel précédent.
 * @param {string} [page.q] recherche par nom.
 * @returns {Promise<Object[]|{items: Object[], nextCursor: string|null}>}
 *   Un tableau en mode historique, un objet paginé sinon.
 */
exports.getFastFoodsService = async (userId, page) => {
  try {
    // ⚠️ Deux formes de retour selon le mode. Sans `limit`, on garde très
    // exactement l'ancien contrat (un tableau) : les versions de l'app déjà
    // installées appellent cette route et casseraient sur un objet.
    const paginated = !!page?.limit;
    let fastfoods;
    let nextCursor = null;

    if (paginated) {
      const res = await repos.fastfoods.getPage(page);
      fastfoods = res.items;
      nextCursor = res.nextCursor;
    } else {
      fastfoods = await repos.fastfoods.getAll();
    }

    if (!fastfoods || fastfoods.length === 0) {
      return paginated ? { items: [], nextCursor: null } : [];
    }

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
        // Vignettes : le home affiche ces menus dans des cartes de 130 à 260 px,
        // les originaux pèsent 300 Ko à 1,1 Mo. Servi ici et non côté app pour
        // que tous les clients en profitent sans rebuild.
        priced.menus = (priced.menus || []).map(withMenuThumbnails);
        // La campagne ne vaut que chez les boutiques livrées par la plateforme ;
        // ailleurs on retombe sur l'éventuel bonus armé du user.
        const campaign = campaignOffer && isPlatformDelivered(fastfood) ? campaignOffer : null;
        // Image de la boutique : WebP a dimensions identiques, comme les menus
        // et les bannieres. Elle etait jusqu'ici la seule servie brute.
        return {
          ...withFastfoodThumbnail(priced),
          deliveryOffer: campaign || pickOfferForFastFood(offers, fastfood.id),
        };
      })
    );

    const withMenus = fastfoodsWithMenus.filter(f => Array.isArray(f.menus) && f.menus.length > 0);

    // Filet de sécurité : en mode paginé, `getPage()` a déjà écarté les
    // boutiques sans plat par jointure interne, donc ce filtre ne retire rien
    // et la page rend bien `limit` boutiques. Il reste indispensable au mode
    // complet (`getAll()`), qui ne filtre pas.
    return paginated ? { items: withMenus, nextCursor } : withMenus;
  } catch (error) {
    console.error('Erreur dans getFastfoods:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
