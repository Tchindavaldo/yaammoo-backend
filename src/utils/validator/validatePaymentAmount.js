// ============================================================================
// validatePaymentAmount — Cohérence du montant à encaisser
// ----------------------------------------------------------------------------
// Le prix affiché de chaque plat contient DÉJÀ la livraison (fondue dedans par
// deliveryPricing). Le montant à payer est donc la simple SOMME des `total` que
// le front affiche par commande — il ne faut JAMAIS ré-ajouter la livraison en
// ligne séparée, sinon le user paierait la livraison en double.
//
// Le montant `amount` étant fourni par le client, on le CONTRÔLE côté serveur
// avant tout appel MobileWallet : il doit égaler la somme des `total` des items.
// Un écart = payload incohérent (surplus/double-livraison ou montant trafiqué)
// → on refuse AVANT le paiement, quand refuser ne coûte encore rien.
//
// ⚠️ Ne s'applique qu'au paiement PLEIN. Un paiement partiel (`mobileApp` avec
// `amount < currentAmount`) encaisse volontairement moins que le total : la
// comparaison n'a pas de sens et l'appelant l'exclut.
// ============================================================================

// Tolérance d'arrondi (FCFA) : les prix sont entiers, mais on laisse 1 unité de
// marge pour absorber un éventuel arrondi de sommation côté client.
const AMOUNT_TOLERANCE = 1;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {number} amount montant que le client veut faire encaisser
 * @param {Array} items commandes du panier (chacune porte son `total` affiché)
 * @returns {string|null} message d'erreur, ou null si cohérent
 */
function validatePaymentAmount(amount, items) {
  const orders = Array.isArray(items) ? items : items ? [items] : [];
  if (orders.length === 0) return null;

  const expected = orders.reduce((sum, o) => sum + toNumber(o?.total), 0);
  const gap = Math.abs(toNumber(amount) - expected);

  if (gap > AMOUNT_TOLERANCE) {
    return `Montant incohérent : ${toNumber(amount)} FCFA demandés pour un total de ` + `${expected} FCFA (somme des commandes). La livraison est déjà comprise dans ` + `le prix des plats et ne doit pas être ajoutée séparément.`;
  }

  return null;
}

module.exports = { validatePaymentAmount, AMOUNT_TOLERANCE };
