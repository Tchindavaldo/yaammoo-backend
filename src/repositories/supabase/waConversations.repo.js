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

/** Date (ISO) du dernier message REÇU de ce numéro, null s'il n'y en a pas (fenêtre de 24 h). */
exports.lastInboundAt = async phone => {
  const { data, error } = await supabase.from(TABLE).select('created_at').eq('phone', phone).eq('direction', 'in').order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0]?.created_at || null;
};

/** Message par son id d'envoi ou de réception (message cité par une réponse). */
exports.getByMessageId = async messageId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('message_id', messageId).order('id', { ascending: false }).limit(1);
  if (error) throw error;
  return m.waMessage.fromSupabase(data?.[0] || null);
};

/** Remplace le texte d'un message déjà journalisé (photo reçue : adresse de l'image ajoutée). */
exports.setBodyByMessageId = async (messageId, body) => {
  const { error } = await supabase.from(TABLE).update({ body }).eq('message_id', messageId);
  if (error) throw error;
};

/**
 * Remplace le texte d'un message SEULEMENT s'il vaut encore `fromBody` (note vocale confirmée
 * ou corrigée : un double clic ne la traite qu'une fois). Renvoie true si remplacé.
 */
exports.swapBodyByMessageId = async (messageId, fromBody, toBody) => {
  const { data, error } = await supabase.from(TABLE).update({ body: toBody }).eq('message_id', messageId).eq('body', fromBody).select('id');
  if (error) throw error;
  return (data || []).length > 0;
};

/** Efface les messages plus anciens que `beforeIso`. Renvoie le nombre effacé. */
exports.purgeBefore = async beforeIso => {
  const { data, error } = await supabase.from(TABLE).delete().lt('created_at', beforeIso).select('id');
  if (error) throw error;
  return (data || []).length;
};
