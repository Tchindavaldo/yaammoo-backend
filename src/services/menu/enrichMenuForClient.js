// ============================================================================
// enrichMenuForClient — Prix AFFICHÉ pour un menu isolé émis en socket
// ----------------------------------------------------------------------------
// Les prix stockés d'un menu sont BRUTS (prix fastfood, sans livraison, marge ni
// frais). Le home client attend le prix AFFICHÉ (ces trois ajoutés, cf.
// deliveryPricing). `getFastFoods` le fait déjà pour la liste — mais les sockets
// qui émettent un menu isolé (`globalMenuUpdated`, `newGlobalMenu`…) renvoyaient
// le brut, faussant l'affichage client.
//
// ⚠️ À utiliser UNIQUEMENT pour les émissions CLIENT (broadcast home). Les
// émissions vers la room du MARCHAND (gestion de sa boutique) doivent garder les
// prix bruts — le marchand gère son catalogue avec ses vrais prix (vue `raw`).
//
// `applyDisplayPricing` a besoin de la BOUTIQUE (ses zones donnent la livraison
// la plus chère) : on la recharge, on enrichit, puis on ré-extrait le menu seul.
// ============================================================================

const repos = require('../../repositories');
const { getPricingSettings } = require('../settings/settings.service');
const { applyDisplayPricing } = require('../pricing/deliveryPricing');

/**
 * @param {Object} menu menu BRUT (tel que stocké)
 * @returns {Promise<Object>} le même menu avec ses prix affichés (client)
 */
async function enrichMenuForClient(menu) {
  if (!menu?.fastFoodId) return menu;
  try {
    const [fastfood, pricing] = await Promise.all([repos.fastfoods.getById(menu.fastFoodId), getPricingSettings()]);
    if (!fastfood) return menu;

    // Enrichit la boutique avec ce seul menu, puis récupère le menu prixé.
    const priced = applyDisplayPricing({ ...fastfood, menus: [menu] }, pricing, false);
    return Array.isArray(priced?.menus) ? priced.menus[0] : menu;
  } catch (e) {
    // Un incident de pricing ne doit pas casser l'émission : on retombe sur le brut.
    console.warn(`[enrichMenuForClient] pricing non appliqué (${menu?.id}): ${e.message}`);
    return menu;
  }
}

module.exports = { enrichMenuForClient };
