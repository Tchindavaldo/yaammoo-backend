// ============================================================================
// WA app only Repository — Supabase (migration 102)
// Marchands et livreurs en mode « app seule » (WhatsApp coupé) ; pas de ligne = les 2 modes.
// Utilisé par services/whatsapp/channelMode.service.js et merchantChannel.send.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'wa_app_only';
const row = r => (r ? { userId: r.user_id, phone: r.phone, role: r.role, fastFoodId: r.fastfood_id, createdAt: r.created_at } : null);

/** Lignes de ce numéro E.164. */
exports.listByPhone = async phone => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('phone', phone);
  if (error) throw error;
  return (data || []).map(row);
};

/** Tous les numéros en app seule. */
exports.listPhones = async () => {
  const { data, error } = await supabase.from(TABLE).select('phone');
  if (error) throw error;
  return [...new Set((data || []).map(r => r.phone))];
};

/** Ce compte est-il en app seule ? */
exports.get = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return row(data);
};

/** Passe ce compte en app seule. */
exports.set = async ({ userId, phone, role, fastFoodId = null }) => {
  const { error } = await supabase.from(TABLE).upsert({ user_id: userId, phone, role, fastfood_id: fastFoodId }, { onConflict: 'user_id' });
  if (error) throw error;
};

/** Repasse ce compte en mode « les 2 ». */
exports.remove = async userId => {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw error;
};
