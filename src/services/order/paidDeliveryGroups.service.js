// ============================================================================
// paidDeliveryGroups — Départs DÉJÀ payés et pas encore partis (groupage)
// ============================================================================
// Un client qui a déjà payé une commande chez une boutique, pour un départ
// (`deliveryGroupKey` : boutique + zone + type + date [+ heure]) qui n'est pas
// encore parti en livraison, ne repaie pas la course : sa nouvelle commande
// rejoint ce départ, exactement comme une commande de plus dans le même panier.
//
// Même mécanique que le panier, rien d'autre :
//   - `validatePaymentAmount` déduit la course de TOUTES les commandes du lot
//     pour ce départ (la course est déjà encaissée) ;
//   - `settleDelivery` les règle en `courseBilled = false` et reprend le
//     `deliveryGroupId` du départ existant.
//
// Départ « pas encore parti » = au moins une commande en `pending`,
// `processing` ou `finished`. Dès qu'il est en `delivering`, la course est due.
// ============================================================================
const repos = require('../../repositories');
const { deliveryGroupKey } = require('../pricing/deliveryGroupKey');

const OPEN_STATUSES = ['pending', 'processing', 'finished'];

/**
 * @param {string} userId
 * @param {Array} orders commandes du lot (exclues de la recherche)
 * @returns {Promise<Map<string,{orderId:string, deliveryGroupId:string|null}>>}
 *   clé de départ -> commande déjà payée qui porte ce départ
 */
async function openPaidGroups(userId, orders) {
  const found = new Map();
  if (!userId) return found;
  const wanted = new Set((orders || []).map(deliveryGroupKey).filter(Boolean));
  if (wanted.size === 0) return found;
  const exclude = new Set((orders || []).map(o => String(o?.id)).filter(Boolean));

  const open = await repos.orders.query({ userId, status: OPEN_STATUSES, orderByCreated: 'asc' });
  const matches = open.filter(o => !exclude.has(String(o.id)) && wanted.has(deliveryGroupKey(o)));
  if (matches.length === 0) return found;

  const deliveries = await repos.orderDeliveries.getByOrders(matches.map(o => o.id)).catch(() => ({}));
  for (const o of matches) {
    const key = deliveryGroupKey(o);
    if (!found.has(key)) found.set(key, { orderId: o.id, deliveryGroupId: deliveries?.[o.id]?.deliveryGroupId ?? null });
  }
  return found;
}

module.exports = { openPaidGroups, OPEN_STATUSES };
