// ============================================================================
// displayPriceCheck — le prix du plat payé est-il encore le prix affiché ?
// ============================================================================
// Explique un refus du pré-check : la boutique a changé pendant que le client
// avait la page ouverte (bascule marchand <-> plateforme, interrupteur global :
// course fondue ou non dans le plat ; zones plateforme, prix, marges).
// Recalcule le prix AFFICHÉ actuel du plat choisi (même fonction que le home,
// `applyDisplayPricing`) et le compare au prix porté par la commande.
// N'est appelé QUE pour expliquer un refus déjà acquis : un panier ancien dont
// le règlement passe n'est jamais refusé pour un écart de prix.
// ============================================================================
const repos = require('../../repositories');
const { getMenuService } = require('../menu/getMenu.services');
const { applyDisplayPricing, toNumber } = require('../pricing/deliveryPricing');
const { withShopDrinks } = require('../menu/shopDrinks');

/**
 * @returns {Promise<string|null>} détail de l'écart (log), ou null si tout est à jour
 */
async function findDisplayPriceChange(orders, pricing) {
  const shops = new Map();
  for (const [i, o] of orders.entries()) {
    const menuId = o?.menu?.id;
    if (!o?.fastFoodId || !menuId) continue;
    if (!shops.has(o.fastFoodId)) {
      const shop = await repos.fastfoods.getById(o.fastFoodId);
      const raw = shop ? await getMenuService(o.fastFoodId) : [];
      const menus = Array.isArray(raw) ? raw : Object.values(raw || {});
      shops.set(o.fastFoodId, shop ? applyDisplayPricing(withShopDrinks({ ...shop, menus }), pricing, false) : null);
    }
    const view = shops.get(o.fastFoodId);
    const menu = (view?.menus || []).find(m => String(m.id) === String(menuId));
    if (!menu) continue;
    const idx = Math.max(0, toNumber(o.selectedPriceIndex) - 1);
    const paid = toNumber(o.menu?.prices?.[idx]?.price);
    const current = toNumber(menu.prices?.[idx]?.price);
    if (current > 0 && paid !== current) {
      return `commande #${i + 1} plat ${menuId} : prix payé ${paid} ≠ prix affiché actuel ${current} (régime ${view.deliveryBy})`;
    }
  }
  return null;
}

module.exports = { findDisplayPriceChange };
