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

exports.save = async ({ uid, userData, fastFoodIds, longRetention, retainUntil, identityKeys }) => {
  const { error } = await supabase.from('account_archives').upsert({ uid, user_data: userData || {}, fastfood_ids: fastFoodIds || [], identity_keys: identityKeys || [], long_retention: longRetention, deleted_at: new Date().toISOString(), retain_until: retainUntil }, { onConflict: 'uid' });
  if (error) throw error;
};

exports.get = async uid => {
  const { data, error } = await supabase.from('account_archives').select('*').eq('uid', uid).maybeSingle();
  if (error) throw error;
  return data;
};

exports.listExpired = async () => {
  const { data, error } = await supabase.from('account_archives').select('uid, fastfood_ids, long_retention, personal_purged, deleted_at').lt('retain_until', new Date().toISOString()).limit(50);
  if (error) throw error;
  return data || [];
};

// Données d'argent (commandes, paiements, règlements, retraits) : gardées 10 ans (CGU).
const MONEY_BY_USER = ['order_deliveries', 'order_refunds', 'order_settlements', 'pending_payments', 'orders', 'transactions', 'withdrawals', 'platform_revenues'];
const MONEY_BY_SHOP = ['order_deliveries', 'order_refunds', 'order_status_history', 'order_settlements', 'pending_payments', 'orders', 'withdrawals', 'platform_revenues'];
// Données personnelles : effacées dès l'échéance du compte (90 jours ou 10 ans).
const PERSONAL_BY_USER = ['ratings', 'notifications', 'bonus_requests', 'bonus_flyer_downloads', 'driver_applications', 'staff_members', 'legal_acceptances', 'merchant_adhesions', 'payout_numbers', 'whatsapp_numbers', 'bird_costs', 'phone_otp', 'outbox_events'];
const PERSONAL_BY_SHOP = ['notifications', 'support_threads', 'driver_applications', 'fastfood_broadcasts', 'staff_members', 'staff_roles', 'analytics_events', 'bonus', 'menus', 'rank_counters', 'merchant_adhesions'];

const del = async (table, col, vals) => {
  let q = supabase.from(table).delete();
  q = Array.isArray(vals) ? q.in(col, vals) : q.eq(col, vals);
  const { error } = await q;
  if (error) console.warn(`[accountPurge] ${table}.${col}: ${error.message}`);
};

/**
 * Compte peu actif à 90 jours : efface les données personnelles et le profil
 * archivé, garde l'argent, et repousse l'échéance à 10 ans après la suppression.
 */
exports.purgePersonal = async (uid, fastFoodIds = [], deletedAt) => {
  for (const t of PERSONAL_BY_USER) await del(t, 'user_id', uid);
  if (fastFoodIds.length) for (const t of PERSONAL_BY_SHOP) await del(t, 'fastfood_id', fastFoodIds);
  const until = new Date(new Date(deletedAt || Date.now()).getTime() + 3652 * 86400000).toISOString();
  const { error } = await supabase.from('account_archives').update({ user_data: {}, identity_keys: [], personal_purged: true, retain_until: until }).eq('uid', uid);
  if (error) throw error;
};

/** Efface toutes les données d'un compte arrivé à échéance (ordre : enfants puis boutiques puis archive). */
exports.purge = async (uid, fastFoodIds = []) => {
  for (const t of [...MONEY_BY_USER, ...PERSONAL_BY_USER]) await del(t, 'user_id', uid);
  if (fastFoodIds.length) {
    for (const t of [...MONEY_BY_SHOP, ...PERSONAL_BY_SHOP]) await del(t, 'fastfood_id', fastFoodIds);
    await del('fastfoods', 'id', fastFoodIds);
  }
  await del('account_archives', 'uid', uid);
};

/**
 * Boutiques supprimées avec un compte de la MÊME personne, encore restaurables.
 * Le compte recréé a un nouvel uid : on rapproche par identités de connexion
 * (email, téléphone, sub Google/Apple), plus l'uid lui-même.
 */
exports.listRestorableShops = async (uid, identityKeys = []) => {
  let q = supabase.from('account_archives').select('uid, fastfood_ids').eq('personal_purged', false);
  q = identityKeys.length ? q.or(`uid.eq.${uid},identity_keys.ov.{${identityKeys.map(k => `"${k.replace(/"/g, '')}"`).join(',')}}`) : q.eq('uid', uid);
  const { data: archives, error: aErr } = await q;
  if (aErr) throw aErr;
  const owners = new Map();
  for (const a of archives || []) for (const id of a.fastfood_ids || []) owners.set(id, a.uid);
  if (!owners.size) return [];
  const { data, error } = await supabase.from('fastfoods').select('id, name, image, deleted_at').in('id', [...owners.keys()]).eq('deleted_reason', 'account').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, name: r.name, image: r.image, deletedAt: r.deleted_at, archiveUid: owners.get(r.id) }));
};

/** La boutique restaurée sort de l'archive : la purge du compte supprimé ne la touche plus. */
exports.detachShop = async (archiveUid, fastFoodId) => {
  const a = await exports.get(archiveUid);
  if (!a) return;
  const { error } = await supabase.from('account_archives').update({ fastfood_ids: (a.fastfood_ids || []).filter(id => id !== fastFoodId) }).eq('uid', archiveUid);
  if (error) throw error;
};
