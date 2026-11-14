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
// Tourne toutes les heures ; le délai est relu en base à chaque tour.
// 0 en base = annulation automatique désactivée.
// ============================================================================
const repos = require('../repositories');
const { getSettings } = require('../services/settings/settings.service');
const { KEYS } = require('../services/settings/settings.keys');
const { OPEN_STATUSES } = require('../services/order/paidDeliveryGroups.service');

const { AGGREGATORS } = require('./paymentAggregator');

const EVERY_MS = 3600000;
let timer = null;

async function runOnce() {
  const days = Number((await getSettings())[KEYS.ORDER_AUTO_CANCEL_DAYS]);
  if (!Number.isFinite(days) || days <= 0) return;
  const limit = Date.now() - days * 86400000;
  const open = await repos.orders.query({ status: OPEN_STATUSES, orderByCreated: 'asc' });
  const { updateOrders } = require('../services/order/updateOrders.service');
  for (const o of open) {
    const created = new Date(o.createdAt).getTime();
    if (!Number.isFinite(created) || created > limit) continue;
    // Seules les commandes réellement payées par pawaPay : les anciennes
    // (avant l'intégration du paiement) restent telles quelles.
    const credit = await repos.transactions.findMerchantCreditByOrder(o.id).catch(() => null);
    if (credit?.aggregator !== AGGREGATORS.PAWAPAY) continue;
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
