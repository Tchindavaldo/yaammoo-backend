// ============================================================================
// Bonus Requests Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'bonus_requests';

exports.create = async (data) => {
  const id = data.id || generateId();
  const payload = m.bonusRequest.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(row);
};

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? m.bonusRequest.fromSupabase(data) : null;
};

exports.getAll = async () => {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data || []).map(m.bonusRequest.fromSupabase);
};

exports.findByUserBonus = async ({ userId, bonusId, bonusType }) => {
  let q = supabase.from(TABLE).select('*').eq('user_id', userId).eq('bonus_id', bonusId);
  if (bonusType) q = q.eq('bonus_type', bonusType);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

exports.updateStatus = async (id, statusArray) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: statusArray, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};
