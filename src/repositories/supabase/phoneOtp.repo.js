// ============================================================================
// Phone OTP Repository — Supabase
// ============================================================================
// Trace de la demande de code en cours pour un numéro. Le CODE n'est jamais
// stocké : Bird le génère et le valide. On ne conserve que le verification_id,
// nécessaire à la vérification et à la lecture du coût réel.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'phone_otp';

const fromSupabase = row =>
  row
    ? {
        phoneNumber: row.phone_number,
        verificationId: row.verification_id,
        userId: row.user_id,
        status: row.status,
        createdAt: row.created_at,
      }
    : null;

/** Une nouvelle demande écrase la précédente pour ce numéro. */
exports.saveRequest = async ({ phoneNumber, verificationId, userId, status }) => {
  const { error } = await supabase.from(TABLE).upsert(
    {
      phone_number: phoneNumber,
      verification_id: verificationId,
      user_id: userId || null,
      status: status || 'pending',
      created_at: new Date().toISOString(),
    },
    { onConflict: 'phone_number' }
  );
  if (error) throw error;
};

exports.getByPhone = async phoneNumber => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('phone_number', phoneNumber).maybeSingle();
  if (error) throw error;
  return fromSupabase(data);
};

exports.deleteByPhone = async phoneNumber => {
  const { error } = await supabase.from(TABLE).delete().eq('phone_number', phoneNumber);
  if (error) throw error;
};
