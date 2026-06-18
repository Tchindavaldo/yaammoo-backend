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

exports.updateStatus = async (id, { status, mwPayoutId, failureReason } = {}) => {
  const patch = { status, updated_at: new Date().toISOString() };
  if (mwPayoutId !== undefined) patch.mw_payout_id = mwPayoutId;
  if (failureReason !== undefined) patch.failure_reason = failureReason;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return m.withdrawal.fromSupabase(data);
};
