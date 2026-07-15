// ============================================================================
// orderBuckets — regroupement des statuts de commande en 3 buckets métier
// ============================================================================
// Source de vérité des statuts : src/interface/orderFields.js
//   pending | pendingToBuy | processing | finished | delivering | delivered
//   | cancelByUser | cancelByFastFood
// Les annulations (cancel*) ne sont dans aucun bucket → ignorées des stats.
// Partagé entre getDriverProfile.service.js et getFastFoodDeliveryStats.service.js
// pour éviter toute divergence si les statuts évoluent.
// ============================================================================

const DELIVERED = new Set(['delivered']);
const IN_PROGRESS = new Set(['processing', 'finished', 'delivering']);
const PENDING = new Set(['pending', 'pendingToBuy']);

/**
 * @param {Array<{status:string}>} orders
 * @returns {{ delivered:number, inProgress:number, pending:number, total:number }}
 */
const countBuckets = (orders) => {
  let delivered = 0, inProgress = 0, pending = 0;
  for (const o of orders) {
    if (DELIVERED.has(o.status)) delivered += 1;
    else if (IN_PROGRESS.has(o.status)) inProgress += 1;
    else if (PENDING.has(o.status)) pending += 1;
  }
  return { delivered, inProgress, pending, total: orders.length };
};

module.exports = { DELIVERED, IN_PROGRESS, PENDING, countBuckets };
