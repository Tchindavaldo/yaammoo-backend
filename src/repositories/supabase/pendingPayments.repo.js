// ============================================================================
// Pending Payments Repository — Supabase
// ============================================================================
// Persiste le contexte d'un paiement MobileWallet entre l'initiation et le
// verdict (webhook HTTP ou socket). Remplace la Map en mémoire mwTransactionMap.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'pending_payments';

const fromRow = (row) =>
  row
    ? {
        mwTransactionId: row.mw_transaction_id,
        userId: row.user_id,
        orderId: row.order_id,
        fastFoodId: row.fastfood_id,
        items: row.items,
        orderCtx: row.order_ctx,
        amount: row.amount,
        network: row.network,
        phone: row.phone,
        email: row.email,
        status: row.status,
      }
    : null;

/**
 * Enregistre (ou écrase) le contexte d'un paiement en attente.
 * @param {string} mwTransactionId
 * @param {object} ctx { userId, orderId, fastFoodId, items, orderCtx, amount, network, phone, email }
 */
exports.save = async (mwTransactionId, ctx) => {
  const payload = {
    mw_transaction_id: mwTransactionId,
    user_id: ctx.userId,
    order_id: ctx.orderId || null,
    fastfood_id: ctx.fastFoodId || null,
    items: ctx.items || null,
    order_ctx: ctx.orderCtx || null,
    amount: ctx.amount ?? null,
    network: ctx.network || null,
    phone: ctx.phone || null,
    email: ctx.email || null,
    status: 'pending',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'mw_transaction_id' })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
};

/** Retrouve par mw_transaction_id. */
exports.getById = async (mwTransactionId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('mw_transaction_id', mwTransactionId)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/** Fallback : retrouve le plus récent paiement en attente d'un user. */
exports.getLatestByUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/** Marque comme réglé (audit / nettoyage ultérieur). */
exports.markSettled = async (mwTransactionId, status) => {
  const { error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('mw_transaction_id', mwTransactionId);
  if (error) throw error;
};
