// ============================================================================
// Withdrawals Repository — Supabase
// ============================================================================
// Trace les DEMANDES de retrait marchand et leur statut. Le solde lui-même est
// calculé depuis `transactions` (cf. transactions.repo.getMerchantBalance).
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'withdrawals';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.withdrawal.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.withdrawal.fromSupabase(row);
};

exports.getByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.withdrawal.fromSupabase);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

// Les versements automatiques de commande (kind 'order', migration 086) n'entrent
// ni dans le cooldown ni dans le blocage doublon des retraits manuels.

/** Dernier retrait manuel (tous statuts) d'un marchand — pour le cooldown. */
exports.getLatestByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).neq('kind', 'order').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

/** Retrait manuel en cours (pending) d'un marchand — pour bloquer les doublons. */
exports.getPendingByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).eq('status', 'pending').neq('kind', 'order').limit(1).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

/** Versement d'une commande en cours ou réussi (pas échoué) — un seul par commande. */
exports.getActiveByOrder = async orderId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('order_id', orderId).neq('status', 'failed').limit(1).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

/** Retrouve un retrait par son id MobileWallet (mw_payout_id) — routage du verdict. */
exports.getByPayoutId = async payoutId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('mw_payout_id', payoutId).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

exports.updateStatus = async (id, { status, mwPayoutId, failureReason, fee } = {}) => {
  const patch = { status, updated_at: new Date().toISOString() };
  if (mwPayoutId !== undefined) patch.mw_payout_id = mwPayoutId;
  if (failureReason !== undefined) patch.failure_reason = failureReason;
  // Frais interréseau réellement retenus par MobileWallet (réponse /payout).
  if (fee !== undefined) patch.fee = fee;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

