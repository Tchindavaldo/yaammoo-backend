// ============================================================================
// Payout numbers Repository — Supabase (migration 079)
// Numéros de retrait vérifiés par code SMS, par compte.
// ============================================================================
const { supabase } = require('../../config/supabase');

/** Marque le numéro (E.164) comme vérifié pour ce compte (idempotent). */
exports.markVerified = async (userId, phoneNumber) => {
  const { error } = await supabase.from('payout_numbers').upsert({ user_id: userId, phone_number: phoneNumber, verified_at: new Date().toISOString() }, { onConflict: 'user_id,phone_number' });
  if (error) throw error;
};

/** true si l'un des formats du numéro est vérifié pour ce compte. */
exports.isVerified = async (userId, variants) => {
  const { data, error } = await supabase.from('payout_numbers').select('phone_number').eq('user_id', userId).in('phone_number', variants).limit(1);
  if (error) throw error;
  return (data || []).length > 0;
};

/** Numéros vérifiés du compte (E.164). */
exports.listByUser = async userId => {
  const { data, error } = await supabase.from('payout_numbers').select('phone_number, verified_at').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(r => ({ phoneNumber: r.phone_number, verifiedAt: r.verified_at }));
};
