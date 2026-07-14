// ============================================================================
// Driver Applications Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'driver_applications';

exports.create = async (data) => {
  const id = data.id || generateId();
  const payload = m.driverApplication.toSupabase({
    ...data,
    id,
    status: data.status || 'pending',
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.driverApplication.fromSupabase(row);
};

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? m.driverApplication.fromSupabase(data) : null;
};

exports.getByFastFood = async (fastFoodId, { status } = {}) => {
  let q = supabase.from(TABLE).select('*').eq('fastfood_id', fastFoodId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(m.driverApplication.fromSupabase);
};

exports.getByUser = async (userId, { status } = {}) => {
  let q = supabase.from(TABLE).select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(m.driverApplication.fromSupabase);
};

// Retire l'association livreur↔boutique (toutes les lignes du couple).
exports.deleteByUserFastFood = async ({ userId, fastFoodId }) => {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('fastfood_id', fastFoodId);
  if (error) throw error;
};

exports.updateStatus = async (id, status) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.driverApplication.fromSupabase(data);
};
