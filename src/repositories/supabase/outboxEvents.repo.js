// ============================================================================
// Outbox Events Repository — Supabase
// ============================================================================
// Persiste les events socket "fiables" pour rejeu après déconnexion.
// Voir migration 005_outbox_events.sql et src/utils/reliableEmit.js.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'outbox_events';

const fromRow = row =>
  row
    ? {
        id: row.id,
        userId: row.user_id,
        event: row.event,
        payload: row.payload || {},
        deliveredAt: row.delivered_at,
        createdAt: row.created_at,
      }
    : null;

/** Persiste un event à destination d'un user. Retourne l'id (pour l'ACK). */
exports.create = async ({ userId, event, payload }) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, event, payload: payload || {} })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

/** Events non encore délivrés d'un user, plus anciens d'abord. */
exports.getUndelivered = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).is('delivered_at', null).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
};

/** Marque un (ou plusieurs) event(s) comme délivré(s). */
exports.markDelivered = async ids => {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return;
  const { error } = await supabase.from(TABLE).update({ delivered_at: new Date().toISOString() }).in('id', list);
  if (error) throw error;
};

/**
 * Purge : supprime les events délivrés, et les non délivrés plus vieux que TTL.
 * @param {number} ttlDays défaut 7
 */
exports.purge = async (ttlDays = 7) => {
  const cutoff = new Date(Date.now() - ttlDays * 86400000).toISOString();
  // délivrés → supprimer
  await supabase.from(TABLE).delete().not('delivered_at', 'is', null);
  // non délivrés trop vieux → supprimer
  await supabase.from(TABLE).delete().is('delivered_at', null).lt('created_at', cutoff);
};
