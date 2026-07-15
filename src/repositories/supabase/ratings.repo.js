// ============================================================================
// Ratings Repository — Supabase (polymorphe : menu | driver | …)
// ============================================================================
// Table `ratings` + fonction SQL atomique `rate_target` (migration 011).
// La moyenne de la cible (menus.rating_avg / users.driver_rating_avg) est
// recalculée dans la fonction SQL — le service ne fait AUCUN calcul d'agrégat.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'ratings';

/**
 * Upsert atomique d'une note + maj moyenne cible (via RPC rate_target).
 * @returns {Promise<{ rating: object, ratingAvg: number, ratingCount: number }>}
 */
exports.rate = async ({ targetType, targetId, userId, orderId = null, value, comment = null, extra = {} }) => {
  const id = generateId();
  const { data, error } = await supabase.rpc('rate_target', {
    p_rating_id: id,
    p_target_type: targetType,
    p_target_id: targetId,
    p_user_id: userId,
    p_order_id: orderId,
    p_value: value,
    p_comment: comment,
    p_extra: extra || {},
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    rating: m.rating.fromSupabase(row),
    ratingAvg: row?.rating_avg != null ? Number(row.rating_avg) : 0,
    ratingCount: row?.rating_count ?? 0,
  };
};

/** Note d'un user pour une cible donnée (ou null). */
exports.getUserRating = async ({ targetType, targetId, userId }) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return m.rating.fromSupabase(data);
};

/** Liste des avis d'une cible (plus récent d'abord). */
exports.listByTarget = async ({ targetType, targetId, limit = 50 }) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(m.rating.fromSupabase);
};
