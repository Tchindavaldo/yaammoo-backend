// ============================================================================
// Order Settlements Repository — Supabase
// ============================================================================
// Règlement d'une commande (migration 023) : l'ARGENT. Une ligne par commande,
// toujours — livrée ou à emporter.
//
// À distinguer de `orderDeliveries.repo` : la COURSE, écrite uniquement quand
// la commande est livrée.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'order_settlements';

const toSupabase = s => ({
  order_id: s.orderId,
  user_id: s.userId,
  fastfood_id: s.fastFoodId ?? null,
  group_id: s.groupId ?? null,
  items_real: s.itemsReal ?? 0,
  items_charged: s.itemsCharged ?? 0,
  payment_fee: s.paymentFee ?? 0,
  platform_margin: s.platformMargin ?? 0,
  delivered: s.delivered !== false,
});

const fromSupabase = row =>
  row && {
    orderId: row.order_id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    groupId: row.group_id ?? null,
    itemsReal: Number(row.items_real),
    itemsCharged: Number(row.items_charged),
    paymentFee: Number(row.payment_fee),
    platformMargin: Number(row.platform_margin),
    delivered: row.delivered !== false,
    createdAt: row.created_at,
  };

/** Idempotent sur `order_id` : un rejeu ne duplique pas la ligne. */
exports.create = async settlement => {
  const { data, error } = await supabase.from(TABLE).upsert(toSupabase(settlement), { onConflict: 'order_id' }).select().single();
  if (error) throw error;
  return fromSupabase(data);
};

exports.getByOrder = async orderId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw error;
  return fromSupabase(data);
};

/** Tout le règlement d'un panier, sans jointure sur `orders`. */
exports.getByGroup = async groupId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('group_id', groupId);
  if (error) throw error;
  return (data || []).map(fromSupabase);
};
