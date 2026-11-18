// ============================================================================
// WA agent modes Repository — Supabase (migration 100)
// Agent actif d'un super-administrateur qui a aussi une boutique WhatsApp : 'admin' (défaut,
// pas de ligne) ou 'merchant'. Utilisé par services/whatsapp/ai/handoffTool.js et l'agent admin.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'wa_agent_modes';

/** Agent actif de ce numéro ('admin' | 'merchant'), null s'il n'a jamais changé. */
exports.get = async phone => {
  const { data, error } = await supabase.from(TABLE).select('mode').eq('phone', phone).maybeSingle();
  if (error) throw error;
  return data?.mode || null;
};

/** Pose l'agent actif de ce numéro. */
exports.set = async (phone, mode) => {
  const { error } = await supabase.from(TABLE).upsert({ phone, mode, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  if (error) throw error;
};
