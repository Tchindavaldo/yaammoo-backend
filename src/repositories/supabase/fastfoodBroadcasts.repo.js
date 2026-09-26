// ============================================================================
// Fastfood Broadcasts Repository — Supabase (migration 053)
// ============================================================================
// Envois de notifications par les boutiques : historique, insertion sous quota
// (fonction `insert_fastfood_broadcast`), destinataires par audience.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'fastfood_broadcasts';

/** Plafond de lignes d'un appel PostgREST : les listes se lisent par pages. */
exports.PAGE_SIZE = 1000;

const fromRow = row =>
  row && {
    id: row.id,
    fastFoodId: row.fastfood_id,
    senderUid: row.sender_uid,
    title: row.title,
    body: row.body || undefined,
    imageUrl: row.image_url || undefined,
    audience: row.audience,
    city: row.audience_city || undefined,
    plan: row.plan,
    recipientsCount: row.recipients_count ?? 0,
    pushedCount: row.pushed_count ?? 0,
    sentAt: row.sent_at,
  };

/**
 * Ce qu'un envoi doit savoir de la boutique : propriétaire, nom, villes, plan.
 * `null` si elle n'existe pas ou est supprimée (soft delete).
 */
exports.getFastfoodContext = async fastFoodId => {
  const { data, error } = await supabase
    .from('fastfoods')
    .select('id, user_id, name, cities, broadcast_plan, deleted_at')
    .eq('id', fastFoodId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at) return null;
  return {
    id: data.id,
    ownerUid: data.user_id,
    name: data.name || '',
    cities: Array.isArray(data.cities) ? data.cities.filter(c => typeof c === 'string') : [],
    plan: data.broadcast_plan || 'free',
  };
};

/** Derniers envois de la boutique, du plus récent au plus ancien. */
exports.listRecent = async (fastFoodId, limit) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('fastfood_id', fastFoodId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(fromRow);
};

/**
 * Insère l'envoi si le quota le permet (compte + insertion atomiques).
 * @returns {Promise<{ ok: true, item } | { ok: false, reason: 'day' | 'week' }>}
 */
exports.insertUnderQuota = async p => {
  const { data, error } = await supabase.rpc('insert_fastfood_broadcast', {
    p_id: p.id,
    p_fastfood_id: p.fastFoodId,
    p_sender_uid: p.senderUid,
    p_title: p.title,
    p_body: p.body || null,
    p_image_url: p.imageUrl || null,
    p_audience: p.audience,
    p_audience_city: p.city || null,
    p_plan: p.plan,
    p_day_start: p.dayStart.toISOString(),
    p_week_start: p.weekStart.toISOString(),
    p_day_limit: p.dayLimit,
    p_week_limit: p.weekLimit,
  });
  if (error) throw error;
  if (!data?.ok) return { ok: false, reason: data?.reason === 'week' ? 'week' : 'day' };
  return { ok: true, item: fromRow(data.row) };
};

/** Bilan de la diffusion, écrit une fois celle-ci terminée. */
exports.setCounts = async (id, { recipientsCount, pushedCount }) => {
  const { error } = await supabase.from(TABLE).update({ recipients_count: recipientsCount, pushed_count: pushedCount }).eq('id', id);
  if (error) throw error;
};

/** Une page des clients de la boutique (uid triés). */
exports.pageCustomerIds = async (fastFoodId, from) => {
  const { data, error } = await supabase
    .rpc('fastfood_customer_ids', { p_fastfood_id: fastFoodId })
    .range(from, from + exports.PAGE_SIZE - 1);
  if (error) throw error;
  return (data || []).map(r => r.uid);
};

/**
 * Une page des utilisateurs d'une ville (uid triés) : dernière localisation
 * connue, sinon villes des boutiques où ils ont commandé (migration 054).
 */
exports.pageCityUserIds = async (city, from) => {
  const { data, error } = await supabase
    .rpc('city_user_ids', { p_city: city })
    .range(from, from + exports.PAGE_SIZE - 1);
  if (error) throw error;
  return (data || []).map(r => r.uid);
};
