// ============================================================================
// orderCancel — Annulation d'une commande PAYÉE : remboursement + reprise
// ============================================================================
// Une commande `pendingToBuy` retirée du panier n'a rien coûté : rien ici.
// Une commande payée annulée (cf. architecture/order-cancel.md) :
//
//   payé     = order.total − course non payée (commande qui partageait la
//              course d'une autre : déduite du montant encaissé)
//   gardé    = course de la commande qui PORTE la course d'un départ ayant
//              encore d'autres commandes ouvertes (elle reste due), rendue
//              plus tard si tout le départ est annulé (kind 'course')
//   base     = payé − gardé
//   frais    = ⌈dépôt[réseau] × base⌉ + ⌈commission MW × base⌉ (frais réels ;
//              la réserve de retrait paie le payout du remboursement)
//   client annule   : rendu = base − frais ; marchand repris = ce qu'il a reçu
//   marchand annule : rendu = base         ; marchand repris = reçu + frais
//
// Reprise marchand = transaction `merchant_debit` sur le réseau du paiement :
// le solde peut devenir négatif (dette reprise sur ses gains suivants).
// Remboursement = payout MobileWallet vers le numéro qui a payé. Paiement
// DigiKUNTZ (pas de frais réels connus) : `manual`, alerte `app_errors`.
// Commande sans argent réel (aucun agrégateur) : rien à rendre.
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { toNumber } = require('../pricing/deliveryPricing');
const { realPaymentFeesOf } = require('../pricing/paymentFees');
const { getPricingSettings } = require('../settings/settings.service');
const mobilewallet = require('../transaction/mobilewalletService');
const { OPEN_STATUSES } = require('./paidDeliveryGroups.service');

const CANCELLABLE = { cancelByUser: ['pending'], cancelByFastFood: ['pending', 'processing', 'finished'] };
const byOf = status => (status === 'cancelByFastFood' ? 'fastfood' : 'user');

/** Refus d'une annulation, ou null si autorisée. */
function cancelRefusal(prevStatus, status) {
  if (prevStatus === 'pendingToBuy') return null; // retrait du panier
  const allowed = CANCELLABLE[status] || [];
  if (allowed.includes(prevStatus)) return null;
  if (status === 'cancelByUser') return 'Le restaurant a déjà accepté cette commande : elle ne peut plus être annulée.';
  return 'Cette commande ne peut plus être annulée.';
}

const isOpen = s => OPEN_STATUSES.includes(s);

/** Le départ a-t-il encore une commande ouverte, en dehors de `orderId` ? */
async function departHasOtherOpen(deliveryGroupId, orderId) {
  if (!deliveryGroupId) return false;
  const rows = await repos.orderDeliveries.getByGroup(deliveryGroupId);
  for (const r of rows) {
    if (String(r.orderId) === String(orderId)) continue;
    const o = await repos.orders.getById(r.orderId).catch(() => null);
    if (o && isOpen(o.status)) return true;
  }
  return false;
}

/** La boutique garde-t-elle d'autres commandes ouvertes du même panier ? */
async function shopHasOtherOpen(settlement, orderId) {
  if (!settlement?.groupId) return false;
  const rows = await repos.orderSettlements.getByGroup(settlement.groupId);
  for (const r of rows || []) {
    if (String(r.orderId) === String(orderId) || r.fastFoodId !== settlement.fastFoodId) continue;
    const o = await repos.orders.getById(r.orderId).catch(() => null);
    if (o && isOpen(o.status)) return true;
  }
  return false;
}

/**
 * Calcul (sans rien écrire). `by` : 'user' | 'fastfood'.
 * @returns {Promise<Object>} plan, `none: true` si aucun argent réel.
 */
async function planCancel(order, by) {
  const credit = await repos.transactions.findMerchantCreditByOrder(order.id);
  if (!credit?.aggregator) return { none: true };
  const settlement = await repos.orderSettlements.getByOrder(order.id);
  const delivery = await repos.orderDeliveries.getByOrder(order.id).catch(() => null);
  const pricing = await getPricingSettings();

  const prix = Math.max(0, toNumber(order.delivery?.prix));
  const offered = !!delivery?.freeReason;
  const courseNotPaid = delivery && !delivery.courseBilled && !offered ? prix : 0;
  const paid = Math.max(0, toNumber(order.total) - courseNotPaid);
  const keepCourse = !!delivery?.courseBilled && !offered && (await departHasOtherOpen(delivery.deliveryGroupId, order.id));
  const courseKept = keepCourse ? prix : 0;
  const base = Math.max(0, paid - courseKept);

  const fees = realPaymentFeesOf(base, pricing, { network: credit.network, aggregator: credit.aggregator });
  const platformRegime = settlement?.deliveryBy === 'platform';
  const courseCredit = platformRegime ? 0 : toNumber(settlement?.driverAmount);
  const kioskFee = toNumber(settlement?.withdrawalFee);
  const kioskKept = kioskFee > 0 && (await shopHasOtherOpen(settlement, order.id));
  const kioskDebit = kioskKept ? 0 : kioskFee;
  const received = toNumber(settlement?.itemsReal) + kioskDebit + (keepCourse ? 0 : courseCredit);

  return {
    by,
    credit,
    settlement,
    deliveryGroupId: delivery?.deliveryGroupId ?? null,
    paid,
    courseKept,
    base,
    manual: fees === null,
    feesKept: fees === null ? 0 : by === 'user' ? fees : 0,
    fees: fees ?? 0,
    amount: fees === null ? 0 : by === 'user' ? Math.max(0, base - fees) : base,
    merchantDebit: settlement ? received + (by === 'fastfood' ? (fees ?? 0) : 0) : 0,
    kioskDebit,
  };
}

/** Écrit la reprise marchand, crée le remboursement et lance le payout. */
async function executeRefund({ order, plan, kind = 'order' }) {
  const fastfood = await repos.fastfoods.getById(order.fastFoodId).catch(() => null);
  const pp = await repos.pendingPayments.getByMwTransactionId(plan.credit.mwTransactionId).catch(() => null);
  const refund = await repos.orderRefunds.create({
    orderId: order.id,
    userId: order.userId,
    fastFoodId: order.fastFoodId,
    cancelledBy: plan.by,
    kind,
    paid: plan.base,
    feesKept: plan.feesKept,
    amount: plan.amount,
    merchantDebit: plan.merchantDebit,
    courseKept: plan.courseKept,
    deliveryGroupId: plan.deliveryGroupId,
    phone: pp?.phone ?? null,
    network: plan.credit.network,
    aggregator: plan.credit.aggregator,
    status: plan.manual || !pp?.phone ? 'manual' : 'pending',
  });
  if (!refund) return null; // déjà remboursée (rejeu)

  const ctx = { orderId: order.id, userId: order.userId, fastFoodId: order.fastFoodId };
  if (plan.merchantDebit > 0 && fastfood?.userId) {
    await repos.transactions
      .create({
        type: 'merchant_debit',
        userId: fastfood.userId,
        amount: plan.merchantDebit,
        name: plan.by === 'fastfood' ? 'Commande annulée par le restaurant' : 'Commande annulée par le client',
        payBy: 'order',
        aggregator: plan.credit.aggregator,
        network: plan.credit.network,
        fastFoodId: order.fastFoodId,
        relatedOrderId: order.id,
        refundId: refund.id,
        feesDebit: plan.kioskDebit || 0,
        paymentFees: plan.by === 'fastfood' ? plan.fees : 0,
      })
      .catch(e => repos.appErrors.record({ scope: 'order_cancel', code: 'merchant_debit_failed', message: `Reprise marchand NON écrite (${plan.merchantDebit} F) : ${e.message}. À régulariser à la main.`, ...ctx, context: { plan: { ...plan, credit: undefined, settlement: undefined } } }));
  }

  if (refund.status === 'manual') {
    await repos.appErrors.record({ scope: 'order_cancel', code: 'refund_manual', message: `Remboursement à faire À LA MAIN : ${plan.amount || plan.base} F (${plan.manual ? 'agrégateur sans remboursement automatique' : 'numéro du payeur introuvable'}).`, ...ctx, context: { refundId: refund.id, aggregator: plan.credit.aggregator, base: plan.base } });
    return refund;
  }
  if (plan.amount <= 0) return repos.orderRefunds.update(refund.id, { status: 'completed' });

  const mw = await mobilewallet.payout({ amount: plan.amount, network: plan.credit.network, sourceNetwork: plan.credit.network, phone: pp.phone, receiverName: 'Client yaammoo', narration: 'Remboursement yaammoo', withdrawalId: refund.id, aggregator: plan.credit.aggregator });
  if (!mw || mw.status === 'error') {
    await repos.orderRefunds.update(refund.id, { status: 'failed', failureReason: mw?.message || 'payout init failed' });
    await repos.appErrors.record({ scope: 'order_cancel', code: 'refund_payout_failed', message: `Remboursement NON envoyé (${plan.amount} F vers ${pp.phone}) : ${mw?.message || 'échec payout'}. À relancer à la main.`, ...ctx, context: { refundId: refund.id } });
    return refund;
  }
  const saved = await repos.orderRefunds.update(refund.id, { mwPayoutId: mw.transaction_id });
  reliableEmit(getIO(), order.userId, 'order.refund', { orderId: order.id, refundId: refund.id, amount: plan.amount, feesKept: plan.feesKept, status: 'pending' }).catch(() => {});
  return saved;
}

/**
 * Courses gardées d'un départ désormais vide (plus aucune commande ouverte) :
 * on les rend, au même régime de frais que l'annulation qui les a gardées.
 */
async function releaseKeptCourses(deliveryGroupId) {
  const kept = await repos.orderRefunds.getKeptCourses(deliveryGroupId).catch(() => []);
  if (kept.length === 0) return;
  if (await departHasOtherOpen(deliveryGroupId, null)) return;
  const pricing = await getPricingSettings();
  for (const row of kept) {
    const order = await repos.orders.getById(row.orderId).catch(() => null);
    const credit = await repos.transactions.findMerchantCreditByOrder(row.orderId);
    const settlement = await repos.orderSettlements.getByOrder(row.orderId);
    if (!order || !credit) continue;
    const fees = realPaymentFeesOf(row.courseKept, pricing, { network: credit.network, aggregator: credit.aggregator });
    const courseCredit = settlement?.deliveryBy === 'platform' ? 0 : toNumber(settlement?.driverAmount);
    const plan = {
      by: row.cancelledBy,
      credit,
      deliveryGroupId,
      base: row.courseKept,
      courseKept: 0,
      manual: fees === null,
      fees: fees ?? 0,
      feesKept: fees === null ? 0 : row.cancelledBy === 'user' ? fees : 0,
      amount: fees === null ? 0 : row.cancelledBy === 'user' ? Math.max(0, row.courseKept - fees) : row.courseKept,
      merchantDebit: courseCredit + (row.cancelledBy === 'fastfood' ? (fees ?? 0) : 0),
      kioskDebit: 0,
    };
    await executeRefund({ order, plan, kind: 'course' });
    await repos.orderRefunds.update(row.id, { courseReleased: true });
  }
}

/**
 * Annulation d'une commande payée (après la transition en base). Ne lève
 * jamais : tout échec d'argent part dans `app_errors`.
 */
async function cancelPaidOrder(order, status) {
  try {
    const plan = await planCancel(order, byOf(status));
    if (plan.none) return null;
    const refund = await executeRefund({ order, plan });
    await releaseKeptCourses(plan.deliveryGroupId);
    return refund;
  } catch (e) {
    console.error(`[orderCancel] ${order.id} : ${e.message}`);
    await repos.appErrors.record({ scope: 'order_cancel', code: 'cancel_failed', message: `Annulation : remboursement non traité (${e.message}). À régulariser à la main.`, orderId: order.id, userId: order.userId, fastFoodId: order.fastFoodId, context: { status } }).catch(() => {});
    return null;
  }
}

/** Devis affiché avant confirmation (aucune écriture). */
async function quoteCancel(order, status) {
  const plan = await planCancel(order, byOf(status));
  if (plan.none) return { refund: 0, feesKept: 0, fees: 0, paid: 0, phone: null };
  // Numéro qui a payé : c'est lui qui reçoit le remboursement.
  const pp = await repos.pendingPayments.getByMwTransactionId(plan.credit.mwTransactionId).catch(() => null);
  // `fees` = frais réels de l'annulation, quel que soit qui les supporte (client : retenus sur le remboursement = feesKept ; marchand : débités du marchand, feesKept 0).
  return { refund: plan.amount, feesKept: plan.feesKept, fees: plan.fees, paid: plan.base, courseKept: plan.courseKept, manual: plan.manual, phone: pp?.phone ?? null };
}

module.exports = { cancelRefusal, cancelPaidOrder, quoteCancel };
