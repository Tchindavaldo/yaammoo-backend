// ============================================================================
// Notifications Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'notifications';

exports.getGroupForUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return m.notification.fromSupabase(data);
};

exports.getGroupForFastFood = async (fastFoodId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('fastfood_id', fastFoodId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return m.notification.fromSupabase(data);
};

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.notification.fromSupabase(data);
};

exports.getAllForTarget = async (target = 'all') => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('target', target)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.notification.fromSupabase);
};

exports.getAllForUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.notification.fromSupabase);
};

/**
 * Append atomique d'une notification via fonction PL/pgSQL.
 * Crée le groupe s'il n'existe pas pour ce user/fastfood.
 */
exports.appendNotification = async ({ userId, fastFoodId, target, notif }) => {
  const groupId = generateId();
  const { data, error } = await supabase.rpc('append_notification', {
    p_group_id: groupId,
    p_user_id: userId || null,
    p_fastfood_id: fastFoodId || null,
    p_target: target || null,
    p_notif: notif,
  });
  if (error) throw error;
  return m.notification.fromSupabase(data);
};

exports.markAsRead = async ({ groupId, notifId, userId }) => {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_group_id: groupId,
    p_notif_id: notifId,
    p_user_id: userId,
  });
  if (error) throw error;
  return m.notification.fromSupabase(data);
};

exports.generateNotifId = () => generateId();
