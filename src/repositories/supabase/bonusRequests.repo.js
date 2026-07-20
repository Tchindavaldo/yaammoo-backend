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
  // Agrégation côté Postgres (migration 013) : renvoie une ligne par bonus au
  // lieu de rapatrier toute la table.
  const { data, error } = await supabase.rpc('bonus_claim_counts', { claimed_statuses: claimedStatuses });

  if (!error) {
    const counts = {};
    for (const row of data || []) counts[row.bonus_id] = Number(row.claim_count) || 0;
    return counts;
  }

  // Repli si la migration 013 n'est pas encore appliquée (fonction absente).
  console.warn('bonus_claim_counts indisponible, repli sur le comptage applicatif:', error.message);
  return countClaimsInApp(claimedStatuses);
};

/** Comptage applicatif — repli uniquement (scanne toute la table). */
async function countClaimsInApp(claimedStatuses) {
  const { data, error } = await supabase.from(TABLE).select('bonus_id, status');
  if (error) throw error;
  const counts = {};
  for (const row of data || []) {
    const entries = Array.isArray(row.status) ? row.status : [];
    const n = entries.filter(e => e && claimedStatuses.includes(e.status)).length;
    if (n > 0) counts[row.bonus_id] = (counts[row.bonus_id] || 0) + n;
  }
  return counts;
}

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
  // Colonne indexée (unique) depuis la migration 014.
  let q = supabase.from(TABLE).select('*').eq('code', code);
  if (bonusType) q = q.eq('bonus_type', bonusType);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

// Champs du cycle d'utilisation promus en colonnes réelles (migration 014).
const USAGE_COLUMNS = { code: 'code', usageCount: 'usage_count', redeemed: 'redeemed' };

/**
 * Met à jour le cycle d'utilisation d'une réclamation (code, usageCount,
 * redeemed) et/ou son tableau `status`. Tout autre champ est fusionné dans
 * extra_data sans écraser les clés existantes.
 *
 * @param {string} id
 * @param {Object} fields        champs à mettre à jour
 * @param {Array}  [statusArray] si fourni, remplace aussi le tableau status
 */
exports.updateUsage = async (id, fields, statusArray) => {
  const update = { updated_at: new Date().toISOString() };
  const leftovers = {};

  for (const [key, value] of Object.entries(fields || {})) {
    if (USAGE_COLUMNS[key]) update[USAGE_COLUMNS[key]] = value;
    else leftovers[key] = value;
  }

  // Fusion d'extra_data uniquement si des champs libres subsistent.
  if (Object.keys(leftovers).length > 0) {
    const { data: current, error: readErr } = await supabase.from(TABLE).select('extra_data').eq('id', id).maybeSingle();
    if (readErr) throw readErr;
    update.extra_data = { ...(current?.extra_data || {}), ...leftovers };
  }

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
