// ============================================================================
// WA conversations Repository — Supabase (migration 090)
// Messages reçus du numéro d'une boutique WhatsApp ou envoyés vers lui :
// historique relu par l'agent IA (services/whatsapp/ai/).
// ============================================================================
const { supabase } = require('../../config/supabase');
const m = require('../mappers');

const TABLE = 'wa_conversation_messages';

/** Ajoute un message ({ phone, direction, author, kind, body, messageId }). */
exports.add = async message => {
  const { error } = await supabase.from(TABLE).insert(m.waMessage.toSupabase(message));
  if (error) throw error;
};

/** Derniers messages d'un numéro, du plus ancien au plus récent, depuis `sinceIso`. */
exports.listByPhone = async (phone, { sinceIso, limit }) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('phone', phone).gte('created_at', sinceIso).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).reverse().map(m.waMessage.fromSupabase);
};

/** Efface les messages plus anciens que `beforeIso`. Renvoie le nombre effacé. */
exports.purgeBefore = async beforeIso => {
  const { data, error } = await supabase.from(TABLE).delete().lt('created_at', beforeIso).select('id');
  if (error) throw error;
  return (data || []).length;
};
