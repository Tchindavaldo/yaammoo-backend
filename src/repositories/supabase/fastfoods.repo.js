// ============================================================================
// Fastfoods Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'fastfoods';

exports.create = async (data) => {
  const id = data.id || generateId();
  const payload = m.fastfood.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.fastfood.fromSupabase(row);
};

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

exports.getAll = async () => {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data || []).map(m.fastfood.fromSupabase);
};

exports.getByUserId = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

exports.update = async (id, fields) => {
  // Merge en mémoire pour préserver les champs non envoyés
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Fastfood ${id} introuvable`);
  const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.fastfood.toSupabase(merged);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

exports.exists = async (id) => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('id', id);
  if (error) throw error;
  return (count || 0) > 0;
};
