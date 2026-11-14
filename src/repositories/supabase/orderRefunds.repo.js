// ============================================================================
// Order Refunds Repository — Supabase (migration 075)
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');

const TABLE = 'order_refunds';
const num = v => (v == null ? 0 : Number(v));

const fromRow = r =>
  r
    ? {
        id: r.id,
        orderId: r.order_id,
        userId: r.user_id,
        fastFoodId: r.fastfood_id,
        cancelledBy: r.cancelled_by,
        kind: r.kind,
        paid: num(r.paid),
        feesKept: num(r.fees_kept),
        amount: num(r.amount),
        merchantDebit: num(r.merchant_debit),
        courseKept: num(r.course_kept),
        courseReleased: !!r.course_released,
        deliveryGroupId: r.delivery_group_id,
        phone: r.phone,
        network: r.network,
        aggregator: r.aggregator,
        status: r.status,
        mwPayoutId: r.mw_payout_id,
        failureReason: r.failure_reason,
        createdAt: r.created_at,
      }
    : null;

/** Crée la ligne ; `null` si elle existe déjà (même commande + kind). */
exports.create = async d => {
  const row = {
    id: d.id || generateId(),
    order_id: d.orderId,
    user_id: d.userId,
    fastfood_id: d.fastFoodId ?? null,
    cancelled_by: d.cancelledBy,
    kind: d.kind || 'order',
    paid: d.paid,
    fees_kept: d.feesKept ?? 0,
    amount: d.amount,
    merchant_debit: d.merchantDebit ?? 0,
    course_kept: d.courseKept ?? 0,
    delivery_group_id: d.deliveryGroupId ?? null,
    phone: d.phone ?? null,
    network: d.network ?? null,
    aggregator: d.aggregator ?? null,
    status: d.status || 'pending',
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) {
    if (error.code === '23505') return null; // déjà remboursée
    throw error;
  }
  return fromRow(data);
};

exports.update = async (id, { status, mwPayoutId, failureReason, courseReleased } = {}) => {
  const patch = { updated_at: new Date().toISOString() };
  if (status !== undefined) patch.status = status;
  if (mwPayoutId !== undefined) patch.mw_payout_id = mwPayoutId;
  if (failureReason !== undefined) patch.failure_reason = failureReason;
  if (courseReleased !== undefined) patch.course_released = courseReleased;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return fromRow(data);
};

exports.getByPayoutId = async payoutId => {
  if (!payoutId) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('mw_payout_id', payoutId).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/** Courses gardées, pas encore rendues, d'un départ. */
exports.getKeptCourses = async deliveryGroupId => {
  if (!deliveryGroupId) return [];
  const { data, error } = await supabase.from(TABLE).select('*').eq('delivery_group_id', deliveryGroupId).eq('kind', 'order').gt('course_kept', 0).eq('course_released', false);
  if (error) throw error;
  return (data || []).map(fromRow);
};
