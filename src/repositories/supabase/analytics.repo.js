// ============================================================================
// Analytics Repository — Supabase (migration 061)
// ============================================================================
// `analytics_sessions` + `analytics_events` (écrits par l'app) et lecture des
// agrégats SQL `analytics_*`. Les connexions socket sont dans
// userConnections.repo.js.
// ============================================================================
const { supabase } = require('../../config/supabase');

const FK_VIOLATION = '23503';
const orNull = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Crée ou met à jour la session (dernière activité, fin, durée).
 * @returns {Promise<boolean>} false si l'utilisateur n'existe pas.
 */
exports.upsertSession = async ({ userId, session }) => {
  const { error } = await supabase.from('analytics_sessions').upsert(
    {
      id: session.id,
      user_id: userId,
      started_at: session.startedAt,
      last_activity_at: session.lastActivityAt,
      ended_at: session.endedAt || null,
      duration_ms: session.durationMs,
      app_version: orNull(session.appVersion),
      platform: orNull(session.platform),
      os_version: orNull(session.osVersion),
      device_model: orNull(session.deviceModel),
    },
    { onConflict: 'id' }
  );
  if (error?.code === FK_VIOLATION) return false;
  if (error) throw error;
  return true;
};

/** Insère un lot d'événements déjà normalisés (`rows` au format table). */
exports.insertEvents = async rows => {
  if (!rows.length) return;
  const { error } = await supabase.from('analytics_events').insert(rows);
  if (error) throw error;
};

/** Événements bruts filtrés, plus récents d'abord. */
exports.listEvents = async ({ userId, type, fastFoodId, from, to, limit }) => {
  let q = supabase
    .from('analytics_events')
    .select('id, user_id, session_id, type, fastfood_id, menu_id, banner_id, data, occurred_at')
    .gte('occurred_at', from)
    .lt('occurred_at', to)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  if (type) q = q.eq('type', type);
  if (fastFoodId) q = q.eq('fastfood_id', fastFoodId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

/** Sessions d'un utilisateur, plus récentes d'abord. */
exports.listSessions = async ({ userId, from, to, limit }) => {
  const { data, error } = await supabase
    .from('analytics_sessions')
    .select('id, started_at, last_activity_at, ended_at, duration_ms, app_version, platform, os_version, device_model')
    .eq('user_id', userId)
    .gte('started_at', from)
    .lt('started_at', to)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

/** Appelle un agrégat `analytics_<name>(p_from, p_to, ...)`. */
exports.aggregate = async (name, params) => {
  const { data, error } = await supabase.rpc(`analytics_${name}`, params);
  if (error) throw error;
  return data || [];
};
