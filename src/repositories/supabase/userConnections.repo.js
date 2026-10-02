// ============================================================================
// User Connections Repository — Supabase (migration 061)
// ============================================================================
// `analytics_connections` : une ligne par connexion socket (join_user). Une ligne
// sans `disconnected_at` = utilisateur en ligne.
// ============================================================================
const { supabase } = require('../../config/supabase');

const FK_VIOLATION = '23503';

/**
 * Ouvre une connexion.
 * @returns {Promise<boolean>} false si l'id n'est pas un utilisateur (ex. une
 *   room de boutique rejointe via join_user).
 */
exports.open = async ({ id, userId, socketId, serverId, appVersion, platform }) => {
  const { error } = await supabase.from('analytics_connections').insert({
    id,
    user_id: userId,
    socket_id: socketId,
    server_id: serverId,
    app_version: appVersion || null,
    platform: platform || null,
  });
  if (error?.code === FK_VIOLATION) return false;
  if (error) throw error;
  return true;
};

exports.close = async id => {
  const { error } = await supabase
    .from('analytics_connections')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', id)
    .is('disconnected_at', null);
  if (error) throw error;
};

/** Au démarrage : ferme les connexions restées ouvertes sur cette machine. */
exports.closeOrphans = async serverId => {
  const { error } = await supabase
    .from('analytics_connections')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('server_id', serverId)
    .is('disconnected_at', null);
  if (error) throw error;
};

/** Connexions ouvertes (utilisateurs en ligne). */
exports.listOpen = async () => {
  const { data, error } = await supabase
    .from('analytics_connections')
    .select('user_id, connected_at, app_version, platform')
    .is('disconnected_at', null)
    .order('connected_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

/** Historique des connexions, plus récentes d'abord. */
exports.list = async ({ userId, from, to, limit }) => {
  let q = supabase
    .from('analytics_connections')
    .select('id, user_id, connected_at, disconnected_at, app_version, platform')
    .gte('connected_at', from)
    .lt('connected_at', to)
    .order('connected_at', { ascending: false })
    .limit(limit);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

/** Nombre total de connexions d'un utilisateur et la dernière. */
exports.summary = async userId => {
  const { data, count, error } = await supabase
    .from('analytics_connections')
    .select('connected_at, disconnected_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0] || null;
  return {
    connectionCount: count || 0,
    lastConnectedAt: last?.connected_at || null,
    online: !!last && !last.disconnected_at,
  };
};
