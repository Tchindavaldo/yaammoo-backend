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

/** Dernier retrait (tous statuts) d'un marchand — pour le cooldown. */
exports.getLatestByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

/** Retrait en cours (pending) d'un marchand — pour bloquer les doublons. */
exports.getPendingByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).eq('status', 'pending').limit(1).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

/** Retrouve un retrait par son id MobileWallet (mw_payout_id) — routage du verdict. */
exports.getByPayoutId = async payoutId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('mw_payout_id', payoutId).maybeSingle();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};

exports.updateStatus = async (id, { status, mwPayoutId, failureReason } = {}) => {
  const patch = { status, updated_at: new Date().toISOString() };
  if (mwPayoutId !== undefined) patch.mw_payout_id = mwPayoutId;
  if (failureReason !== undefined) patch.failure_reason = failureReason;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};
