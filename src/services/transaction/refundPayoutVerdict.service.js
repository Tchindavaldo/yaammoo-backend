// ============================================================================
// refundPayoutVerdict — Verdict du payout d'un REMBOURSEMENT (order_refunds)
// ============================================================================
// Routé par mwVerdictService (mw_payout_id). La reprise marchand est déjà
// écrite à l'annulation : ici on ne fait que suivre l'envoi au client.
//   successful       → refund 'completed', socket `order.refund` au client
//   failed/cancelled → refund 'failed' + alerte app_errors (à relancer)
// Idempotence : reserveSettlement (un seul canal traite le verdict).
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

exports.refundPayoutVerdict = async (refund, data, source) => {
  const { transaction_id, status } = data;
  const reserved = await repos.transactions.reserveSettlement(transaction_id, source, status);
  if (!reserved || refund.status === 'completed' || refund.status === 'failed') return;

  const ok = status === 'successful';
  await repos.orderRefunds.update(refund.id, ok ? { status: 'completed' } : { status: 'failed', failureReason: data.message || status });
  if (!ok) {
    await repos.appErrors.record({ scope: 'order_cancel', code: 'refund_payout_failed', message: `Remboursement REFUSÉ par l'opérateur (${refund.amount} F vers ${refund.phone}) : ${data.message || status}. À relancer à la main.`, orderId: refund.orderId, userId: refund.userId, fastFoodId: refund.fastFoodId, context: { refundId: refund.id, transaction_id } });
  }
  reliableEmit(getIO(), refund.userId, 'order.refund', { orderId: refund.orderId, refundId: refund.id, amount: refund.amount, feesKept: refund.feesKept, status: ok ? 'completed' : 'failed' }).catch(() => {});
};
