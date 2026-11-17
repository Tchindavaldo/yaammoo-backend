// ============================================================================
// Orders Repository — Supabase
// ============================================================================
// Atomicité du ranking + stock check garantie par les fonctions PL/pgSQL.
// Voir BACKEND/src/db/schema.sql pour les définitions de :
//   - create_order_with_stock_check
//   - reserve_rank / assign_rank
//   - reindex_queue / reset_counter
// ============================================================================

const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'orders';

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.order.fromSupabase(data);
};

/** Commandes d'un même panier (`group_id`) pour une boutique (flux WhatsApp marchand). */
exports.getByGroup = async (groupId, fastFoodId) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('group_id', groupId).eq('fastfood_id', fastFoodId).is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

// Les commandes d'une boutique supprimée par un admin sont en corbeille
// (`deleted_at`, migration 047) : elles disparaissent des listes marchand,
// client et livreur sans attendre la purge.
const alive = qb => qb.is('deleted_at', null);

exports.getByFastFood = async fastFoodId => {
  const { data, error } = await alive(supabase.from(TABLE).select('*').eq('fastfood_id', fastFoodId)).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

exports.getByUser = async userId => {
  const { data, error } = await alive(supabase.from(TABLE).select('*').eq('user_id', userId)).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

exports.getByDriver = async driverId => {
  const { data, error } = await alive(supabase.from(TABLE).select('*').eq('driver_id', driverId)).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

/**
 * Commandes d'un livreur à un statut donné, en version légère (`{ id, userId }`).
 * Appelé à chaque position du livreur en course (~10 s) : ne lit que deux
 * colonnes, par l'index `idx_orders_driver_status` (migration 060).
 */
exports.getLightByDriverAndStatus = async (driverId, status) => {
  const { data, error } = await alive(supabase.from(TABLE).select('id, user_id').eq('driver_id', driverId).eq('status', status));
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, userId: r.user_id }));
};

/**
 * Query flexible (équivalent du repo Firestore).
 */
exports.query = async ({ fastFoodId, userId, status, createdAfter, orderByCreated = 'desc' } = {}) => {
  let q = alive(supabase.from(TABLE).select('*'));
  if (fastFoodId) q = q.eq('fastfood_id', fastFoodId);
  // ISO : seulement les commandes créées depuis (agent IA WhatsApp : 30 derniers jours).
  if (createdAfter) q = q.gte('created_at', createdAfter);
  if (userId) q = q.eq('user_id', userId);
  if (status) {
    if (Array.isArray(status)) q = q.in('status', status);
    else q = q.eq('status', status);
  }
  if (orderByCreated) q = q.order('created_at', { ascending: orderByCreated === 'asc' });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

/**
 * Recherche de l'agent IA WhatsApp : commandes de boutiques (`fastFoodIds`), éventuellement
 * d'un livreur, filtrées par statut et période, plus récentes d'abord. `limit` absent = tout.
 * @returns {Promise<{ orders: object[], hasMore: boolean }>}
 */
exports.searchForAgent = async ({ fastFoodIds, driverId, status, createdAfter, createdBefore, limit, offset = 0 } = {}) => {
  if (!fastFoodIds?.length) return { orders: [], hasMore: false };
  let q = alive(supabase.from(TABLE).select('*')).in('fastfood_id', fastFoodIds);
  if (driverId) q = q.eq('driver_id', driverId);
  if (status?.length) q = q.in('status', status);
  if (createdAfter) q = q.gte('created_at', createdAfter);
  if (createdBefore) q = q.lt('created_at', createdBefore);
  q = q.order('created_at', { ascending: false });
  // Une ligne de plus que la page : dit s'il y a une page suivante.
  if (limit) q = q.range(offset, offset + limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).map(m.order.fromSupabase);
  return limit ? { orders: rows.slice(0, limit), hasMore: rows.length > limit } : { orders: rows, hasMore: false };
};

/** Commandes de boutiques dont l'id finit par `suffix` (n° à 6 caractères écrit par le marchand). */
exports.findByIdSuffix = async (fastFoodIds, suffix) => {
  const s = String(suffix || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!fastFoodIds?.length || !s) return [];
  const { data, error } = await alive(supabase.from(TABLE).select('*'))
    .in('fastfood_id', fastFoodIds)
    .ilike('id', `%${s.replace(/_/g, '\\_')}`)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data || []).map(m.order.fromSupabase);
};

/**
 * Création atomique de commande avec stock check + ranking.
 * Reproduit exactement la logique de createOrder.js Firestore.
 * @returns {Promise<{order?: object, error?: string}>}
 */
exports.createWithStockCheck = async order => {
  const id = order.id || generateId();
  const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.rpc('create_order_with_stock_check', {
    p_order_id: id,
    p_user_id: order.userId,
    p_fastfood_id: order.fastFoodId,
    p_menu_id: order.menu?.id || null,
    p_menu_snapshot: order.menu || null,
    p_quantity: order.quantity || 1,
    p_extra: order.extra || [],
    p_drink: order.drink || [],
    p_delivery: order.delivery || {},
    p_delivery_date: deliveryDate,
    p_total: order.total || 0,
    p_status: order.status,
    p_user_data: order.userData || null,
    p_selected_price_index: order.selectedPriceIndex ?? null,
  });

  if (error) throw error;
  if (data && data.error) return { error: data.error };

  return {
    order: m.order.fromSupabase({
      id,
      user_id: order.userId,
      fastfood_id: order.fastFoodId,
      menu_snapshot: order.menu || null,
      quantity: order.quantity || 1,
      extra: order.extra || [],
      drink: order.drink || [],
      delivery: order.delivery || {},
      total: order.total,
      status: order.status,
      rank: data?.rank ?? null,
      user_data: order.userData || null,
      selected_price_index: order.selectedPriceIndex ?? null,
      created_at: data?.created_at,
      updated_at: data?.updated_at,
    }),
    newStock: data?.new_stock,
  };
};

/**
 * Mise à jour d'une commande. `expectedStatus` (option) : écriture SEULEMENT si le
 * statut en base est encore celui-là (verrou optimiste) ; sinon renvoie null. Deux
 * actions concurrentes (client qui annule, marchand qui accepte) : une seule passe.
 */
exports.update = async (id, fields, { expectedStatus } = {}) => {
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Commande ${id} introuvable`);
  if (expectedStatus && existing.status !== expectedStatus) return null;
  const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.order.toSupabase(merged);
  // delete des champs : si fields explicitement à null, on les set null
  if (fields.__delete) {
    for (const k of fields.__delete) {
      const snake =
        {
          rank: 'rank',
          clientId: 'client_id',
          periodKey: 'period_key',
        }[k] || k;
      payload[snake] = null;
    }
  }
  let q = supabase.from(TABLE).update(payload).eq('id', id);
  if (expectedStatus) q = q.eq('status', expectedStatus);
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data?.length) {
    if (expectedStatus) return null;
    throw new Error(`Commande ${id} introuvable`);
  }
  return m.order.fromSupabase(data[0]);
};

exports.delete = async id => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};

// ===== Ranking =====

exports.reserveRank = async ({ fastFoodId, deliveryDate, status }) => {
  const { data, error } = await supabase.rpc('reserve_rank', {
    p_fastfood_id: fastFoodId,
    p_delivery_date: deliveryDate,
    p_status: status,
  });
  if (error) throw error;
  return data;
};

exports.assignRank = async ({ orderId, fastFoodId, deliveryDate, status }) => {
  const { data, error } = await supabase.rpc('assign_rank', {
    p_order_id: orderId,
    p_fastfood_id: fastFoodId,
    p_delivery_date: deliveryDate,
    p_status: status,
  });
  if (error) throw error;
  return data;
};

exports.reindexQueue = async ({ fastFoodId, deliveryDate, status, removedRanks }) => {
  const ranks = Array.isArray(removedRanks) ? removedRanks : [removedRanks];
  const cleaned = ranks.map(Number).filter(r => !isNaN(r) && r > 0);
  if (cleaned.length === 0) return [];

  const { data, error } = await supabase.rpc('reindex_queue', {
    p_fastfood_id: fastFoodId,
    p_delivery_date: deliveryDate,
    p_status: status,
    p_removed_ranks: cleaned,
  });
  if (error) throw error;
  // data: tableau de { out_id, out_user_id, out_rank, out_status, out_delivery }
  return (data || []).map(row => ({
    id: row.out_id,
    userId: row.out_user_id,
    rank: row.out_rank,
    status: row.out_status,
    delivery: row.out_delivery,
  }));
};

exports.resetCounter = async ({ fastFoodId, deliveryDate, status, value }) => {
  const { error } = await supabase.rpc('reset_counter', {
    p_fastfood_id: fastFoodId,
    p_delivery_date: deliveryDate,
    p_status: status,
    p_value: value || 0,
  });
  if (error) throw error;
};
