// ============================================================================
// Order Deliveries Repository — Supabase
// ============================================================================
// Vérité comptable de la livraison d'une commande (migration 020).
// Complète `orders.delivery` (JSONB), ne le remplace pas.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'order_deliveries';

const toSupabase = d => ({
  order_id: d.orderId,
  user_id: d.userId,
  fastfood_id: d.fastFoodId ?? null,
  zone: d.zone ?? null,
  real_price: d.realPrice ?? 0,
  charged_price: d.chargedPrice ?? 0,
  platform_margin: d.platformMargin ?? 0,
  free_reason: d.freeReason ?? null,
  covered_by: d.coveredBy ?? null,
  bonus_id: d.bonusId ?? null,
  bonus_code: d.bonusCode ?? null,
  // Panier : plusieurs commandes, une seule course réellement due.
  delivery_group_id: d.deliveryGroupId ?? null,
  course_billed: d.courseBilled !== false,
  // false = à emporter : rien n'est dû au fastfood, tout part en marge.
  delivered: d.delivered !== false,
  items_real: d.itemsReal ?? 0,
  items_charged: d.itemsCharged ?? 0,
  payment_fee: d.paymentFee ?? 0,
});

const fromSupabase = row =>
  row && {
    orderId: row.order_id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    zone: row.zone,
    realPrice: Number(row.real_price),
    chargedPrice: Number(row.charged_price),
    platformMargin: Number(row.platform_margin),
    freeReason: row.free_reason,
    coveredBy: row.covered_by,
    bonusId: row.bonus_id,
    bonusCode: row.bonus_code,
    deliveryGroupId: row.delivery_group_id ?? null,
    courseBilled: row.course_billed !== false,
    delivered: row.delivered !== false,
    itemsReal: Number(row.items_real ?? 0),
    itemsCharged: Number(row.items_charged ?? 0),
    paymentFee: Number(row.payment_fee ?? 0),
    createdAt: row.created_at,
  };

/** Idempotent sur `order_id` : un rejeu ne duplique pas la ligne. */
exports.create = async delivery => {
  const { data, error } = await supabase.from(TABLE).upsert(toSupabase(delivery), { onConflict: 'order_id' }).select().single();
  if (error) throw error;
  return fromSupabase(data);
};

exports.getByOrder = async orderId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw error;
  return fromSupabase(data);
};

exports.getByOrders = async orderIds => {
  if (!orderIds || orderIds.length === 0) return {};
  const { data, error } = await supabase.from(TABLE).select('*').in('order_id', orderIds);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.order_id] = fromSupabase(row);
  return map;
};
