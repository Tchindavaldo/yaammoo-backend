// ============================================================================
// Users Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const m = require('../mappers');

const TABLE = 'users';
const PUSH = 'user_push_tokens';
const FCM = 'user_fcm_tokens';

const fetchUserBundle = async (userId) => {
  if (!userId) return null;
  const [{ data: userRow, error: e1 }, { data: pushRows, error: e2 }, { data: fcmRows, error: e3 }] = await Promise.all([
    supabase.from(TABLE).select('*').eq('id', userId).maybeSingle(),
    supabase.from(PUSH).select('*').eq('user_id', userId),
    supabase.from(FCM).select('*').eq('user_id', userId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (!userRow) return null;
  return m.user.fromSupabase(userRow, pushRows || [], fcmRows || []);
};

exports.getAllUsers = async () => {
  const { data: users, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  if (!users || users.length === 0) return [];
  const ids = users.map((u) => u.id);
  const [{ data: pushRows }, { data: fcmRows }] = await Promise.all([
    supabase.from(PUSH).select('*').in('user_id', ids),
    supabase.from(FCM).select('*').in('user_id', ids),
  ]);
  return users.map((row) =>
    m.user.fromSupabase(
      row,
      (pushRows || []).filter((t) => t.user_id === row.id),
      (fcmRows || []).filter((t) => t.user_id === row.id)
    )
  );
};

exports.getUserById = async (id) => {
  const user = await fetchUserBundle(id);
  if (!user) throw new Error(`Aucun utilisateur trouvé avec l'ID : ${id}`);
  return user;
};

exports.getUserByIdSafe = async (id) => fetchUserBundle(id);

exports.createUser = async (data) => {
  const userId = data.uid || data.id;
  const payload = m.user.toSupabase({
    ...data,
    id: userId,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  return userId;
};

exports.saveUser = async (id, data) => {
  // Équivalent set(..., {merge:true}). On lit, on merge en mémoire, on réécrit
  // pour préserver les champs non envoyés.
  const existing = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const current = existing.data ? m.user.fromSupabase(existing.data, [], []) : { id };
  const merged = { ...current, ...data, id };
  const payload = m.user.toSupabase({
    ...merged,
    updatedAt: new Date().toISOString(),
  });
  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' });
  if (error) throw error;
};

exports.updateUser = async (id, data) => {
  const { fcmToken, ...rest } = data || {};

  if (Object.keys(rest).length > 0) {
    await exports.saveUser(id, rest);
  }

  if (fcmToken && typeof fcmToken === 'string') {
    const { error } = await supabase
      .from(FCM)
      .upsert({ user_id: id, token: fcmToken }, { onConflict: 'user_id,token' });
    if (error) throw error;
  }
};

exports.removeFcmToken = async (id, token) => {
  if (!token) return;
  const { error } = await supabase.from(FCM).delete().eq('user_id', id).eq('token', token);
  if (error) throw error;
};

// ===== Push tokens multi-device =====

exports.addPushToken = async (userId, { token, platform, deviceId }) => {
  if (!token || !platform || !deviceId) {
    throw new Error('token, platform et deviceId sont requis');
  }
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('platform doit être "ios" ou "android"');
  }
  // Upsert sur (user_id, device_id) → remplace l'entrée existante pour ce device
  const { error } = await supabase.from(PUSH).upsert(
    {
      user_id: userId,
      device_id: deviceId,
      token,
      platform,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' }
  );
  if (error) throw error;

  const { count } = await supabase
    .from(PUSH)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return { count: count || 0 };
};

exports.removePushToken = async (userId, { deviceId }) => {
  if (!deviceId) throw new Error('deviceId requis');
  const { data: removed, error: eDel } = await supabase
    .from(PUSH)
    .delete()
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .select();
  if (eDel) throw eDel;

  const { count } = await supabase
    .from(PUSH)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return { removed: (removed || []).length, count: count || 0 };
};

exports.cleanStaleTokens = async (userId, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  await Promise.all([
    supabase.from(PUSH).delete().eq('user_id', userId).in('token', staleTokens),
    supabase.from(FCM).delete().eq('user_id', userId).in('token', staleTokens),
  ]);
};

exports.getUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fetchUserBundle(data.id);
};

exports.getUserByPhone = async (phone) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('numero', parseInt(phone, 10))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fetchUserBundle(data.id);
};
