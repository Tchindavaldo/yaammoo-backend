// ============================================================================
// Menus Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'menus';

exports.create = async (data) => {
  const id = data.id || generateId();
  const payload = m.menu.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.menu.fromSupabase(row);
};

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

exports.getByFastFood = async (fastFoodId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('fastfood_id', fastFoodId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.menu.fromSupabase);
};

exports.update = async (id, fields) => {
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Menu ${id} introuvable`);
  const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.menu.toSupabase(merged);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

exports.updateStock = async (id, newStock) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

exports.delete = async (id) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};
