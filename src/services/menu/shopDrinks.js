// ============================================================================
// shopDrinks — Boissons rattachées à la BOUTIQUE (migration 062)
// ----------------------------------------------------------------------------
// Une boisson appartient au stock de la boutique, plus à un plat. Par défaut
// elle est proposée avec TOUS les plats (`menuIds: null`) ; le marchand peut la
// restreindre à certains plats (`menuIds: [id, ...]`).
//
// Compatibilité : à la lecture, `menu.drink` est RECONSTRUIT depuis les
// boissons de la boutique, au format historique ({ name, prix, status,
// quantite }). Les anciennes apps, la commande, le contrôle du montant et la
// tarification continuent donc de lire `menu.drink` sans rien changer.
// Une boutique sans boisson garde son ancien `menu.drink` (données legacy).
// ============================================================================
const crypto = require('crypto');

const badRequest = message => Object.assign(new Error(message), { code: 400 });

/** Vrai si la boisson est proposée avec ce plat. */
const drinkAppliesTo = (drink, menuId) => !Array.isArray(drink?.menuIds) || drink.menuIds.includes(menuId);

/**
 * Valide et normalise la liste envoyée par le marchand (remplacement complet).
 * Lève une erreur 400 au premier élément invalide.
 */
function sanitizeShopDrinks(list) {
  if (!Array.isArray(list)) throw badRequest('drinks doit être un tableau.');
  return list.map((d, i) => {
    if (!d || typeof d !== 'object') throw badRequest(`drinks[${i}] doit être un objet.`);
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) throw badRequest(`drinks[${i}].name est requis.`);
    const prix = Number(d.prix);
    if (!Number.isFinite(prix) || prix < 0) throw badRequest(`drinks[${i}].prix doit être un nombre >= 0.`);
    if (d.menuIds != null && (!Array.isArray(d.menuIds) || d.menuIds.some(id => typeof id !== 'string'))) {
      throw badRequest(`drinks[${i}].menuIds doit être null (tous les plats) ou un tableau d'ids.`);
    }
    return {
      id: typeof d.id === 'string' && d.id ? d.id : crypto.randomUUID(),
      name,
      prix,
      status: d.status !== false,
      menuIds: Array.isArray(d.menuIds) ? [...new Set(d.menuIds)] : null,
    };
  });
}

/** Boissons de la boutique au format historique `menu.drink`, pour un plat. */
const drinksForMenu = (drinks, menuId) =>
  drinks.filter(d => drinkAppliesTo(d, menuId)).map(d => ({ id: d.id, name: d.name, prix: d.prix, status: d.status, quantite: 1 }));

/**
 * Reconstruit `menu.drink` de chaque plat depuis `fastfood.drinks`.
 * Sans boisson boutique : rien ne change (legacy `menu.drink` conservé).
 */
function withShopDrinks(fastfood) {
  const drinks = Array.isArray(fastfood?.drinks) ? fastfood.drinks : [];
  if (drinks.length === 0 || !Array.isArray(fastfood.menus)) return fastfood;
  return { ...fastfood, menus: fastfood.menus.map(m => ({ ...m, drink: drinksForMenu(drinks, m.id) })) };
}

module.exports = { sanitizeShopDrinks, drinksForMenu, withShopDrinks, drinkAppliesTo };
