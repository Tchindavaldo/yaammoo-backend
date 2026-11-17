// ============================================================================
// orderAutoCancelJob — Annule d'office les commandes payées non livrées
// ============================================================================
// Une commande payée (`pending`, `processing`, `finished`) que le marchand n'a
// pas livrée au bout de `order_auto_cancel_days` jours (settings_app, 7 par
// défaut) est annulée comme si le restaurant l'avait annulée : le client est
// remboursé en entier et les frais réels sont repris au marchand
// (`orderCancel.service`). Passe par `updateOrders`, donc mêmes sockets,
// recalcul du panier et traces que l'annulation manuelle.
// Seulement les commandes payées par pawaPay (les anciennes, d'avant le vrai
// paiement, ne sont jamais annulées d'office).
// Garde-fous (décision du 17/11/2026) : jamais les boutiques masquées
// (`hidden_fastfood_ids`, boutique review) ; jamais une commande dont la trace
// de paiement (`pending_payments`, seule source du numéro du payeur) manque :
// le client ne pourrait pas être remboursé. Alerte `app_errors` pour un admin
// (une seule par commande) à la place.
// Tourne toutes les heures ; le délai est relu en base à chaque tour.
// 0 en base = annulation automatique désactivée.
// ============================================================================
const repos = require('../repositories');
const { getSettings, getHiddenFastfoodIds } = require('../services/settings/settings.service');
const { KEYS } = require('../services/settings/settings.keys');
const { OPEN_STATUSES } = require('../services/order/paidDeliveryGroups.service');

const { AGGREGATORS } = require('./paymentAggregator');

const EVERY_MS = 3600000;
let timer = null;

const NO_TRACE = 'auto_cancel_no_payment_trace';

/** Remboursable = trace de paiement avec le numéro du payeur. Sinon : alerte (une fois) et on n'annule pas. */
async function refundable(order, credit, days) {
  const pp = await repos.pendingPayments.getByMwTransactionId(credit.mwTransactionId).catch(() => null);
  if (pp?.phone) return true;
  const known = await repos.appErrors.existsForOrder('order_cancel', NO_TRACE, order.id).catch(() => false);
  if (!known) {
    await repos.appErrors.record({
      scope: 'order_cancel',
      code: NO_TRACE,
      message: `Commande non livrée depuis plus de ${days} j, NON annulée d'office : trace de paiement absente, le client ne pourrait pas être remboursé. À vérifier par un admin.`,
      orderId: order.id,
      userId: order.userId,
      fastFoodId: order.fastFoodId,
      context: { mwTransactionId: credit.mwTransactionId || null, amount: credit.amount ?? null, network: credit.network || null, hasPendingPayment: !!pp },
    });
  }
  console.warn(`[orderAutoCancel] ${order.id} NON annulée : trace de paiement absente (alerte app_errors).`);
  return false;
}

async function runOnce() {
  const days = Number((await getSettings())[KEYS.ORDER_AUTO_CANCEL_DAYS]);
  if (!Number.isFinite(days) || days <= 0) return;
  const limit = Date.now() - days * 86400000;
  const open = await repos.orders.query({ status: OPEN_STATUSES, orderByCreated: 'asc' });
  const { updateOrders } = require('../services/order/updateOrders.service');
  const hidden = await getHiddenFastfoodIds();
  for (const o of open) {
    const created = new Date(o.createdAt).getTime();
    if (!Number.isFinite(created) || created > limit) continue;
    if (hidden.has(String(o.fastFoodId))) continue;
    // Seules les commandes réellement payées par pawaPay : les anciennes
    // (avant l'intégration du paiement) restent telles quelles.
    const credit = await repos.transactions.findMerchantCreditByOrder(o.id).catch(() => null);
    if (credit?.aggregator !== AGGREGATORS.PAWAPAY) continue;
    if (!(await refundable(o, credit, days))) continue;
    const r = await updateOrders({ id: o.id, status: 'cancelByFastFood', fastFoodId: o.fastFoodId }, o.userId).catch(e => ({ success: false, message: e.message }));
    if (r?.success === false) console.warn(`[orderAutoCancel] ${o.id} non annulée : ${r.message}`);
    else console.log(`[orderAutoCancel] ${o.id} annulée d'office (${days} j sans livraison).`);
  }
}

exports.startOrderAutoCancelJob = () => {
  const tick = async () => {
    await runOnce().catch(e => console.error('[orderAutoCancel] échec :', e.message));
    timer = setTimeout(tick, EVERY_MS);
    timer.unref?.();
  };
  timer = setTimeout(tick, EVERY_MS);
  timer.unref?.();
};
exports.runOrderAutoCancelOnce = runOnce;
