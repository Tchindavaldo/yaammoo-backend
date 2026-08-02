// ============================================================================
// Support Threads Repository — Supabase
// ============================================================================
// Fils de discussion du chat support + leurs messages.
// `fastfood_id` NULL = demande adressee a la plateforme yaammoo.
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const THREADS = 'support_threads';
const MESSAGES = 'support_messages';

// Jointure boutique : le frontend affiche son nom en titre du fil.
const THREAD_SELECT = '*, fastfoods:fastfood_id (id, nom)';

exports.createThread = async data => {
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const payload = m.supportThread.toSupabase({
    ...data,
    id,
    status: data.status || 'open',
    unreadCount: data.unreadCount || 0,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  });
  const { data: row, error } = await supabase.from(THREADS).insert(payload).select(THREAD_SELECT).single();
  if (error) throw error;
  return m.supportThread.fromSupabase(row);
};

exports.getThreadById = async id => {
  const { data, error } = await supabase.from(THREADS).select(THREAD_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? m.supportThread.fromSupabase(data) : null;
};

exports.getThreadsByUser = async userId => {
  const { data, error } = await supabase.from(THREADS).select(THREAD_SELECT).eq('user_id', userId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.supportThread.fromSupabase);
};

exports.updateThread = async (id, patch) => {
  const payload = m.supportThread.toSupabase({ ...patch, updatedAt: patch.updatedAt || new Date().toISOString() });
  const { data, error } = await supabase.from(THREADS).update(payload).eq('id', id).select(THREAD_SELECT).single();
  if (error) throw error;
  return m.supportThread.fromSupabase(data);
};

exports.createMessage = async data => {
  const id = data.id || generateId();
  const payload = m.supportMessage.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(MESSAGES).insert(payload).select().single();
  if (error) throw error;
  return m.supportMessage.fromSupabase(row);
};

exports.getMessagesByThread = async threadId => {
  const { data, error } = await supabase.from(MESSAGES).select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(m.supportMessage.fromSupabase);
};
