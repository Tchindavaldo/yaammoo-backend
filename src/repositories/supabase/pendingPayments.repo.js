// ============================================================================
// Pending Payments Repository — Supabase
// ============================================================================
// Persiste le contexte d'un paiement MobileWallet entre l'initiation et le
// verdict (webhook HTTP ou socket).
//
// CLÉ D'IDENTITÉ : `payment_ref` — un ID unique généré PAR NOUS pour CHAQUE
// paiement, envoyé à MobileWallet comme `end_user_ref`. MobileWallet nous le
// renvoie tel quel dans le webhook → on retrouve le contexte de façon
// DÉTERMINISTE (pas de devinette, pas de fallback "dernier paiement du user").
//
// `mw_transaction_id` (l'ID que MobileWallet attribue) est stocké en plus, pour
// l'idempotence du verdict (reserveSettlement), mais N'EST PAS la clé de lookup.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'pending_payments';

const fromRow = (row) =>
  row
    ? {
        paymentRef: row.payment_ref,
        mwTransactionId: row.mw_transaction_id,
        userId: row.user_id,
        items: row.items,
        amount: row.amount,
        network: row.network,
        phone: row.phone,
        email: row.email,
        status: row.status,
      }
    : null;

/**
 * Crée le contexte d'un paiement en attente AVANT l'appel MobileWallet.
 * @param {string} paymentRef  ID unique généré par nous (= end_user_ref MW)
 * @param {object} ctx { userId, items, amount, network, phone, email }
 *   items = tableau de commandes complètes (chacune avec son fastFoodId).
 */
exports.create = async (paymentRef, ctx) => {
  const payload = {
    payment_ref: paymentRef,
    user_id: ctx.userId,
    items: ctx.items || null,
    amount: ctx.amount ?? null,
    network: ctx.network || null,
    phone: ctx.phone || null,
    email: ctx.email || null,
    status: 'pending',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'payment_ref' })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
};

/** Attache le mw_transaction_id retourné par MobileWallet à l'init. */
exports.setMwTransactionId = async (paymentRef, mwTransactionId) => {
  const { error } = await supabase
    .from(TABLE)
    .update({ mw_transaction_id: mwTransactionId, updated_at: new Date().toISOString() })
    .eq('payment_ref', paymentRef);
  if (error) throw error;
};

/** Retrouve par payment_ref (= end_user_ref renvoyé par MobileWallet). */
exports.getByRef = async (paymentRef) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('payment_ref', paymentRef)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/** Marque le statut final (settled / cancelled). */
exports.markSettled = async (paymentRef, status) => {
  const { error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('payment_ref', paymentRef);
  if (error) throw error;
};
