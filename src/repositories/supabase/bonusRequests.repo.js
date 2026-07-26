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

/**
 * Réclamation COURANTE d'un user pour un bonus.
 *
 * ⚠️ Depuis la migration 029, chaque réclamation est une LIGNE distincte : un
 * même (user, bonus) peut en avoir plusieurs (cycles successifs). La courante
 * est désignée par `is_current`, avec un index unique partiel qui garantit
 * qu'il n'y en a jamais deux — inutile de trier ou de deviner.
 */
exports.findByUserBonus = async ({ userId, bonusId }) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('bonus_id', bonusId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

/**
 * Ouvre un nouveau cycle : démote la réclamation courante de ce (user, bonus)
 * puis insère la nouvelle. L'ancienne devient de l'historique consultable.
 *
 * ATOMIQUE via la RPC `bonus_request_open_cycle` (migration 030) : les deux
 * écritures s'appliquent ensemble ou pas du tout. Sans elle, un crash entre la
 * démotion et l'insertion laisserait le (user, bonus) SANS ligne courante — le
 * user paraîtrait n'avoir jamais réclamé alors que son historique existe.
 *
 * ⚠️ La démotion précède l'insertion : l'index unique partiel
 * `idx_bonus_requests_current` (migration 029) interdit deux lignes courantes.
 */
exports.createCurrent = async data => {
  const id = data.id || generateId();
  const payload = m.bonusRequest.toSupabase({
    ...data,
    id,
    isCurrent: true,
    createdAt: data.createdAt || new Date().toISOString(),
  });

  const { data: row, error } = await supabase.rpc('bonus_request_open_cycle', {
    p_id: payload.id,
    p_user_id: payload.user_id,
    p_bonus_id: payload.bonus_id,
    p_status: payload.status,
    p_code: payload.code,
    p_usage_count: payload.usage_count,
    p_redeemed: payload.redeemed,
    p_armed: payload.armed,
    p_extra_data: payload.extra_data,
    p_created_at: payload.created_at,
  });

  // `RETURNS bonus_requests` donne un objet unique, mais PostgREST enveloppe
  // certains retours dans un tableau : on normalise plutôt que de supposer.
  if (!error) return m.bonusRequest.fromSupabase(Array.isArray(row) ? row[0] : row);

  // Repli si la migration 030 n'est pas encore appliquée (fonction absente) :
  // même effet, mais en deux appels — donc non atomique.
  console.warn('bonus_request_open_cycle indisponible, repli non atomique:', error.message);
  await supabase.from(TABLE).update({ is_current: false, updated_at: new Date().toISOString() }).eq('user_id', data.userId).eq('bonus_id', data.bonusId).eq('is_current', true);

  return exports.create({ ...data, id, isCurrent: true });
};

/**
 * Retrouve une réclamation par son code (unique par réclamation active).
 *
 * Restreint aux lignes COURANTES : un code de cycle clos ne doit plus rien
 * ouvrir, même s'il traîne encore dans l'historique.
 */
exports.findByCode = async code => {
  // Colonne indexée (unique) depuis la migration 014.
  let q = supabase.from(TABLE).select('*').eq('code', code).eq('is_current', true);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return m.bonusRequest.fromSupabase(data);
};

/**
 * Vrai si le code est déjà attribué. Sert au pré-contrôle anti-collision à la
 * génération — l'index unique reste l'autorité finale.
 */
exports.codeExists = async code => {
  const { data, error } = await supabase.from(TABLE).select('id').eq('code', code).limit(1).maybeSingle();
  if (error) throw error;
  return !!data;
};

/**
 * Réclamations ARMÉES d'un user (armement global, depuis la page bonus).
 * Lues à chaque affichage du home pour savoir où la livraison est offerte.
 */
exports.getArmedByUser = async userId => {
  // `is_current` : un cycle clos ne doit jamais offrir une livraison, même si
  // sa ligne d'historique a gardé `armed = true`.
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).eq('armed', true).eq('is_current', true);
  if (error) throw error;
  return (data || []).map(m.bonusRequest.fromSupabase);
};

// Champs du cycle d'utilisation promus en colonnes réelles (migrations 014/018).
const USAGE_COLUMNS = { code: 'code', usageCount: 'usage_count', redeemed: 'redeemed', armed: 'armed', isCurrent: 'is_current' };

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
