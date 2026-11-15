// ============================================================================
// Account archives Repository — Supabase (migration 080)
// Comptes supprimés : profil archivé et échéance de conservation.
// ============================================================================
const { supabase } = require('../../config/supabase');

/** Premier et dernier paiement réel (order_settlements) du compte, en client ou en boutique. */
exports.paymentSpan = async (uid, fastFoodIds = []) => {
  const read = async (col, vals, asc) => {
    let q = supabase.from('order_settlements').select('created_at').order('created_at', { ascending: asc }).limit(1);
    q = Array.isArray(vals) ? q.in(col, vals) : q.eq(col, vals);
    const { data, error } = await q;
    if (error) throw error;
    return data?.[0]?.created_at || null;
  };
  const dates = [await read('user_id', uid, true), await read('user_id', uid, false)];
  if (fastFoodIds.length) dates.push(await read('fastfood_id', fastFoodIds, true), await read('fastfood_id', fastFoodIds, false));
  const ts = dates.filter(Boolean).map(d => new Date(d).getTime());
  return ts.length ? { first: Math.min(...ts), last: Math.max(...ts) } : null;
};

exports.save = async ({ uid, userData, fastFoodIds, longRetention, retainUntil }) => {
  const { error } = await supabase.from('account_archives').upsert({ uid, user_data: userData || {}, fastfood_ids: fastFoodIds || [], long_retention: longRetention, deleted_at: new Date().toISOString(), retain_until: retainUntil }, { onConflict: 'uid' });
  if (error) throw error;
};

exports.get = async uid => {
  const { data, error } = await supabase.from('account_archives').select('*').eq('uid', uid).maybeSingle();
  if (error) throw error;
  return data;
};

exports.listExpired = async () => {
  const { data, error } = await supabase.from('account_archives').select('uid, fastfood_ids').lt('retain_until', new Date().toISOString()).limit(50);
  if (error) throw error;
  return data || [];
};

/** Efface toutes les données d'un compte arrivé à échéance (ordre : enfants puis boutiques puis archive). */
exports.purge = async (uid, fastFoodIds = []) => {
  const del = async (table, col, vals) => {
    let q = supabase.from(table).delete();
    q = Array.isArray(vals) ? q.in(col, vals) : q.eq(col, vals);
    const { error } = await q;
    if (error) console.warn(`[accountPurge] ${table}.${col}: ${error.message}`);
  };
  for (const t of ['order_deliveries', 'order_refunds', 'order_settlements', 'pending_payments', 'orders', 'transactions', 'withdrawals', 'platform_revenues', 'ratings', 'notifications', 'bonus_requests', 'bonus_flyer_downloads', 'driver_applications', 'staff_members', 'legal_acceptances', 'merchant_adhesions', 'payout_numbers', 'whatsapp_numbers', 'bird_costs', 'phone_otp', 'outbox_events']) await del(t, 'user_id', uid);
  if (fastFoodIds.length) {
    for (const t of ['order_deliveries', 'order_refunds', 'order_status_history', 'order_settlements', 'pending_payments', 'orders', 'withdrawals', 'platform_revenues', 'notifications', 'support_threads', 'driver_applications', 'fastfood_broadcasts', 'staff_members', 'staff_roles', 'analytics_events', 'bonus', 'menus', 'rank_counters', 'merchant_adhesions']) await del(t, 'fastfood_id', fastFoodIds);
    await del('fastfoods', 'id', fastFoodIds);
  }
  await del('account_archives', 'uid', uid);
};

/** Boutiques supprimées avec le compte, encore restaurables (échéance non passée). */
exports.listRestorableShops = async uid => {
  const { data, error } = await supabase.from('fastfoods').select('id, name, image, deleted_at').eq('user_id', uid).eq('deleted_reason', 'account').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, name: r.name, image: r.image, deletedAt: r.deleted_at }));
};
