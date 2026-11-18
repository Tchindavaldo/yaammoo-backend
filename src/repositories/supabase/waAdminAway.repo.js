// ============================================================================
// WA admin away Repository — Supabase (migration 104)
// Super-admin parti sur l'autre backend (prod <-> test) et depuis quand : récap à son retour.
// Utilisé par services/whatsapp/admin/{adminTools,adminAgent.service}.js et le job des numéros fixés.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'wa_admin_away';

/** Depuis quand ce numéro est parti (ISO), null s'il est là. */
exports.get = async phone => {
  const { data, error } = await supabase.from(TABLE).select('since').eq('phone', phone).maybeSingle();
  if (error) throw error;
  return data?.since || null;
};

/** Numéros partis sur l'autre backend. */
exports.listPhones = async () => {
  const { data, error } = await supabase.from(TABLE).select('phone');
  if (error) throw error;
  return (data || []).map(r => r.phone);
};

/** Note le départ de ce numéro (maintenant). */
exports.set = async phone => {
  const { error } = await supabase.from(TABLE).upsert({ phone, since: new Date().toISOString() }, { onConflict: 'phone' });
  if (error) throw error;
};

/** Il est revenu. */
exports.remove = async phone => {
  const { error } = await supabase.from(TABLE).delete().eq('phone', phone);
  if (error) throw error;
};
