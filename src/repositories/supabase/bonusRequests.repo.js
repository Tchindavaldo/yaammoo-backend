// ============================================================================
// Bonus Requests Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'bonus_requests';

exports.create = async data => {
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

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? m.bonusRequest.fromSupabase(data) : null;
};

exports.getAll = async () => {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data || []).map(m.bonusRequest.fromSupabase);
};

exports.getByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(m.bonusRequest.fromSupabase);
};

/**
 * Compte, par bonus, le nombre total de réclamations accordées (tous users).
 * Une "réclamation" = une entrée du tableau `status` avec un statut accordé.
 * @param {string[]} claimedStatuses statuts considérés comme accordés
 * @returns {Promise<Object>} map bonusId -> count
 */
exports.claimCountsByBonus = async (claimedStatuses = ['approved', 'completed']) => {
  const { data, error } = await supabase.from(TABLE).select('bonus_id, status');
  if (error) throw error;
  const counts = {};
  for (const row of data || []) {
    const entries = Array.isArray(row.status) ? row.status : [];
    const n = entries.filter(e => e && claimedStatuses.includes(e.status)).length;
    if (n > 0) counts[row.bonus_id] = (counts[row.bonus_id] || 0) + n;
  }
  return counts;
};

exports.findByUserBonus = async ({ userId, bonusId, bonusType }) => {
  let q = supabase.from(TABLE).select('*').eq('user_id', userId).eq('bonus_id', bonusId);
  if (bonusType) q = q.eq('bonus_type', bonusType);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

/**
 * Retrouve une réclamation par son code (unique par réclamation active).
 */
exports.findByCode = async (code, bonusType) => {
  let q = supabase.from(TABLE).select('*').eq('extra_data->>code', code);
  if (bonusType) q = q.eq('bonus_type', bonusType);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

/**
 * Met à jour les champs portés par extra_data (code, usageCount, redeemed…)
 * sans écraser les autres clés déjà présentes.
 * @param {string} id
 * @param {Object} fields  champs à fusionner dans extra_data
 * @param {Array}  [statusArray] si fourni, remplace aussi le tableau status
 */
exports.updateExtraData = async (id, fields, statusArray) => {
  const { data: current, error: readErr } = await supabase.from(TABLE).select('extra_data').eq('id', id).maybeSingle();
  if (readErr) throw readErr;

  const merged = { ...(current?.extra_data || {}), ...fields };
  const update = { extra_data: merged, updated_at: new Date().toISOString() };
  if (statusArray) update.status = statusArray;

  const { data, error } = await supabase.from(TABLE).update(update).eq('id', id).select().single();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

exports.updateStatus = async (id, statusArray) => {
  const { data, error } = await supabase.from(TABLE).update({ status: statusArray, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};
