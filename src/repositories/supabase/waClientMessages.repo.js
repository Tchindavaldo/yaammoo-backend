// ============================================================================
// WA client messages Repository — Supabase (migration 090)
// Messages / questions d'une boutique WhatsApp à un client (posés par l'agent IA),
// et la réponse du client depuis l'app.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'wa_client_messages';

exports.create = async message => {
  const row = m.waClientMessage.toSupabase({ ...message, id: message.id || generateId() });
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return m.waClientMessage.fromSupabase(data);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.waClientMessage.fromSupabase(data);
};

/** Messages d'un client (option : une commande), plus récents d'abord. */
exports.listByUser = async (userId, { orderId } = {}) => {
  let q = supabase.from(TABLE).select('*').eq('user_id', userId);
  if (orderId) q = q.eq('order_id', orderId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.waClientMessage.fromSupabase);
};

/** Messages liés à ces commandes (contexte de l'agent IA). */
exports.listByOrders = async orderIds => {
  if (!orderIds?.length) return [];
  const { data, error } = await supabase.from(TABLE).select('*').in('order_id', orderIds).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(m.waClientMessage.fromSupabase);
};

/** Enregistre la réponse SEULEMENT si la question est encore ouverte. Renvoie le message ou null. */
exports.answerIfOpen = async (id, answer) => {
  const { data, error } = await supabase.from(TABLE).update({ answer, status: 'answered', answered_at: new Date().toISOString() }).eq('id', id).eq('status', 'open').select();
  if (error) throw error;
  return data?.length ? m.waClientMessage.fromSupabase(data[0]) : null;
};

/** Efface les messages plus anciens que `beforeIso`. */
exports.purgeBefore = async beforeIso => {
  const { error } = await supabase.from(TABLE).delete().lt('created_at', beforeIso);
  if (error) throw error;
};
