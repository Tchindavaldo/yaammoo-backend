// ============================================================================
// Mappers contenus — notifications, candidatures livreur, bannières, support
// ============================================================================
// Séparés de mappers.js (au-delà du plafond R3), réexportés par lui.
// ============================================================================
const { toIso, toDate } = require('./mapperUtils');

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------
const notificationToSupabase = data => {
  return {
    id: data.id,
    user_id: data.userId ?? null,
    fastfood_id: data.fastFoodId ?? null,
    target: data.target ?? null,
    all_notif: data.allNotif ?? [],
    created_at: toIso(data.createdAt),
    updated_at: toIso(data.updatedAt) || toIso(data.createdAt),
  };
};

const notificationFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    target: row.target,
    allNotif: row.all_notif || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ---------------------------------------------------------------------------
// DRIVER APPLICATIONS (candidatures livreur)
// ---------------------------------------------------------------------------
const driverApplicationToSupabase = data => {
  const { createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'userId', 'fastFoodId', 'status'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    fastfood_id: data.fastFoodId,
    status: data.status ?? 'pending',
    extra_data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const driverApplicationFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// BANNERS (publicité carrousel home)
// ---------------------------------------------------------------------------
const bannerToSupabase = data => {
  return {
    ...(data.id !== undefined ? { id: data.id } : {}),
    title: data.title ?? null,
    image_url: data.imageUrl,
    type: data.type ?? 'none',
    target_id: data.targetId ?? null,
    active: data.active ?? true,
    sort_order: data.sortOrder ?? 0,
    created_at: toIso(data.createdAt),
    updated_at: toIso(data.updatedAt),
  };
};

const bannerFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? '',
    imageUrl: row.image_url,
    type: row.type,
    targetId: row.target_id ?? null,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ---------------------------------------------------------------------------
// SUPPORT (chat client <-> support yaammoo)
// ---------------------------------------------------------------------------
// fastFoodId null = demande adressee a la plateforme yaammoo (pas de boutique).
const supportThreadToSupabase = data => {
  const out = {};
  if (data.id !== undefined) out.id = data.id;
  if (data.userId !== undefined) out.user_id = data.userId;
  if (data.fastFoodId !== undefined) out.fastfood_id = data.fastFoodId || null;
  if (data.topic !== undefined) out.topic = data.topic;
  if (data.title !== undefined) out.title = data.title;
  if (data.status !== undefined) out.status = data.status;
  if (data.unreadCount !== undefined) out.unread_count = data.unreadCount;
  if (data.supportUnreadCount !== undefined) out.support_unread_count = data.supportUnreadCount;
  if (data.lastMessage !== undefined) out.last_message = data.lastMessage;
  if (data.createdAt !== undefined) out.created_at = toDate(data.createdAt);
  if (data.updatedAt !== undefined) out.updated_at = toDate(data.updatedAt);
  return out;
};

const supportThreadFromSupabase = row => {
  if (!row) return null;
  // La boutique est jointe quand elle existe ; sinon le fil vise yaammoo.
  const ff = row.fastfoods || row.fastfood || null;
  // Client a l'origine du fil : affiche en titre cote marchand.
  const u = row.users || row.user || null;
  const clientName = u ? [u.prenom, u.nom].filter(Boolean).join(' ').trim() : '';
  return {
    id: row.id,
    userId: row.user_id,
    client: { id: row.user_id, nom: clientName || 'Client' },
    fastFood: row.fastfood_id ? { id: row.fastfood_id, nom: ff ? ff.name || ff.nom || null : null } : null,
    topic: row.topic,
    title: row.title || '',
    status: row.status,
    unreadCount: row.unread_count || 0,
    supportUnreadCount: row.support_unread_count || 0,
    lastMessage: row.last_message || '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

const supportMessageToSupabase = data => {
  const out = {};
  if (data.id !== undefined) out.id = data.id;
  if (data.threadId !== undefined) out.thread_id = data.threadId;
  if (data.author !== undefined) out.author = data.author;
  if (data.text !== undefined) out.text = data.text;
  if (data.createdAt !== undefined) out.created_at = toDate(data.createdAt);
  return out;
};

const supportMessageFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    author: row.author,
    text: row.text,
    createdAt: toIso(row.created_at),
  };
};

module.exports = {
  notification: { toSupabase: notificationToSupabase, fromSupabase: notificationFromSupabase },
  driverApplication: { toSupabase: driverApplicationToSupabase, fromSupabase: driverApplicationFromSupabase },
  supportThread: { toSupabase: supportThreadToSupabase, fromSupabase: supportThreadFromSupabase },
  supportMessage: { toSupabase: supportMessageToSupabase, fromSupabase: supportMessageFromSupabase },
  banner: { toSupabase: bannerToSupabase, fromSupabase: bannerFromSupabase },
};
