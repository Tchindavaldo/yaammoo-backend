// ============================================================================
// Mappers Firestore <-> Supabase
// ============================================================================
// Conventions :
//   - Firestore: camelCase, infos.nested, ISO strings, arrays d'objets
//   - Supabase : snake_case, colonnes plates, TIMESTAMPTZ, JSONB
//
// Ces mappers permettent à l'API REST de toujours renvoyer un format
// compatible avec l'app mobile (Firestore-like) quel que soit le backend.
// ============================================================================

const toIso = v => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return null;
};

const toDate = v => {
  if (!v) return null;
  if (typeof v === 'string') {
    // 'YYYY-MM-DD' ou ISO complet
    return v.length >= 10 ? v.substring(0, 10) : null;
  }
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return null;
};

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------
const userToSupabase = data => {
  const { infos = {}, pushTokens, createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'uid', 'fastFoodId', 'isMarchand', 'isAdmin', 'statistique', 'cmd', 'driverRatingAvg', 'driverRatingCount'];
  const extra = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra[k] = rest[k];
  }
  return {
    id: data.id || data.uid,
    uid: data.uid || data.id,
    nom: infos.nom ?? null,
    prenom: infos.prenom ?? null,
    age: infos.age ?? null,
    numero: infos.numero != null ? Number(infos.numero) : null,
    email: infos.email ?? null,
    password: infos.password ?? null,
    fastfood_id: data.fastFoodId ?? null,
    is_marchand: !!data.isMarchand,
    // Rôle admin : jamais dérivé, contrairement à isMarchand (calculé depuis fastFoodId).
    ...(data.isAdmin !== undefined ? { is_admin: !!data.isAdmin } : {}),
    statistique: data.statistique ?? 0,
    cmd: data.cmd ?? [],
    extra_data: extra,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const userFromSupabase = (row, pushTokens = []) => {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.uid || row.id,
    infos: {
      nom: row.nom,
      prenom: row.prenom,
      age: row.age,
      numero: row.numero,
      email: row.email,
      password: row.password,
    },
    fastFoodId: row.fastfood_id,
    isMarchand: !!row.fastfood_id,
    isAdmin: !!row.is_admin,
    driverRatingAvg: row.driver_rating_avg != null ? Number(row.driver_rating_avg) : 0,
    driverRatingCount: row.driver_rating_count ?? 0,
    statistique: row.statistique,
    cmd: row.cmd || [],
    pushTokens: (pushTokens || []).map(t => ({
      token: t.token,
      platform: t.platform,
      deviceId: t.device_id,
      lastSeen: t.last_seen,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// FASTFOODS
// ---------------------------------------------------------------------------
const fastfoodToSupabase = data => {
  const { createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'userId', 'name', 'number', 'momoNumber', 'whatsappNumber', 'openTime', 'closeTime', 'image', 'orderLeadTime', 'advanceDays', 'pickupOnly', 'cities', 'deliveryHours', 'driverRatingAvg', 'driverRatingCount'];
  const extra = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    name: data.name ?? null,
    number: data.number ?? null,
    momo_number: data.momoNumber ?? null,
    whatsapp_number: data.whatsappNumber ?? null,
    open_time: data.openTime ?? null,
    close_time: data.closeTime ?? null,
    image: data.image ?? null,
    order_lead_time: data.orderLeadTime ?? null,
    advance_days: data.advanceDays ?? null,
    pickup_only: data.pickupOnly ?? null,
    cities: data.cities ?? [],
    delivery_hours: data.deliveryHours ?? [],
    extra_data: extra,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const fastfoodFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    number: row.number,
    momoNumber: row.momo_number ?? null,
    whatsappNumber: row.whatsapp_number ?? null,
    openTime: row.open_time,
    closeTime: row.close_time,
    image: row.image,
    orderLeadTime: row.order_lead_time,
    advanceDays: row.advance_days ?? 0,
    pickupOnly: row.pickup_only ?? false,
    cities: row.cities || [],
    deliveryHours: row.delivery_hours || [],
    driverRatingAvg: row.driver_rating_avg != null ? Number(row.driver_rating_avg) : 0,
    driverRatingCount: row.driver_rating_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------------------
const menuToSupabase = data => {
  const { createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'fastFoodId', 'titre', 'name', 'prix1', 'prix2', 'prix3', 'optionPrix1', 'optionPrix2', 'optionPrix3', 'image', 'coverImage', 'images', 'disponibilite', 'status', 'stock', 'extra', 'drink', 'ratingAvg', 'ratingCount'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    fastfood_id: data.fastFoodId,
    titre: data.titre ?? null,
    name: data.name ?? null,
    prix1: data.prix1 ?? null,
    prix2: data.prix2 ?? null,
    prix3: data.prix3 ?? null,
    option_prix1: data.optionPrix1 ?? null,
    option_prix2: data.optionPrix2 ?? null,
    option_prix3: data.optionPrix3 ?? null,
    image: data.image ?? null,
    cover_image: data.coverImage ?? null,
    images: data.images ?? [],
    disponibilite: data.disponibilite ?? null,
    status: data.status ?? null,
    stock: data.stock ?? 0,
    extra: data.extra ?? [],
    drink: data.drink ?? [],
    extra_data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const menuFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    fastFoodId: row.fastfood_id,
    titre: row.titre,
    name: row.name,
    prix1: row.prix1 != null ? Number(row.prix1) : null,
    prix2: row.prix2 != null ? Number(row.prix2) : null,
    prix3: row.prix3 != null ? Number(row.prix3) : null,
    optionPrix1: row.option_prix1,
    optionPrix2: row.option_prix2,
    optionPrix3: row.option_prix3,
    image: row.image,
    coverImage: row.cover_image,
    images: row.images || [],
    disponibilite: row.disponibilite,
    status: row.status,
    stock: row.stock ?? 0,
    extra: row.extra || [],
    drink: row.drink || [],
    ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : 0,
    ratingCount: row.rating_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// RATINGS (polymorphe : menu | driver | …)
// ---------------------------------------------------------------------------
const ratingFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id ?? row.rating_id,
    targetType: row.target_type,
    targetId: row.target_id,
    userId: row.user_id,
    orderId: row.order_id ?? null,
    value: row.value != null ? Number(row.value) : null,
    comment: row.comment ?? null,
    ...(row.extra_data ? { extra: row.extra_data } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------
const orderToSupabase = data => {
  const { createdAt, updatedAt, menu, userData, selectedPriceIndex, ...rest } = data;
  const known = ['id', 'userId', 'fastFoodId', 'quantity', 'extra', 'drink', 'delivery', 'total', 'status', 'rank', 'clientId', 'periodKey', 'driverId'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    fastfood_id: data.fastFoodId,
    menu_id: menu?.id ?? data.menuId ?? null,
    menu_snapshot: menu ?? null,
    quantity: data.quantity ?? 1,
    extra: data.extra ?? [],
    drink: data.drink ?? [],
    delivery: data.delivery ?? {},
    delivery_date: toDate(data.delivery?.date) || toDate(createdAt) || new Date().toISOString().substring(0, 10),
    total: data.total ?? null,
    status: data.status,
    rank: data.rank ?? null,
    client_id: data.clientId ?? null,
    period_key: data.periodKey ?? null,
    driver_id: data.driverId ?? null,
    user_data: userData ?? null,
    selected_price_index: selectedPriceIndex ?? null,
    extra_data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const orderFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    menu: row.menu_snapshot,
    quantity: row.quantity ?? 1,
    extra: row.extra || [],
    drink: row.drink || [],
    delivery: row.delivery || {},
    total: row.total != null ? Number(row.total) : null,
    status: row.status,
    rank: row.rank ?? undefined,
    clientId: row.client_id ?? undefined,
    periodKey: row.period_key ?? undefined,
    driverId: row.driver_id ?? undefined,
    userData: row.user_data ?? undefined,
    selectedPriceIndex: row.selected_price_index ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------
const transactionToSupabase = data => {
  const { createdAt, ...rest } = data;
  const known = ['id', 'userId', 'type', 'amount', 'currentAmount', 'payBy', 'name', 'remainingAmount'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    type: data.type ?? null,
    amount: data.amount ?? null,
    current_amount: data.currentAmount ?? null,
    pay_by: data.payBy ?? null,
    name: data.name ?? null,
    remaining_amount: data.remainingAmount ?? null,
    extra_data,
    created_at: toIso(createdAt),
  };
};

const transactionFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount != null ? Number(row.amount) : null,
    currentAmount: row.current_amount != null ? Number(row.current_amount) : null,
    payBy: row.pay_by,
    name: row.name,
    remainingAmount: row.remaining_amount != null ? Number(row.remaining_amount) : null,
    createdAt: row.created_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// WITHDRAWALS (retraits marchand)
// ---------------------------------------------------------------------------
const withdrawalToSupabase = data => ({
  id: data.id,
  user_id: data.userId,
  fastfood_id: data.fastFoodId ?? null,
  amount: data.amount ?? null,
  phone: data.phone ?? null,
  network: data.network ?? null,
  status: data.status ?? 'pending',
  mw_payout_id: data.mwPayoutId ?? null,
  failure_reason: data.failureReason ?? null,
  created_at: toIso(data.createdAt),
});

const withdrawalFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fastFoodId: row.fastfood_id,
    amount: row.amount != null ? Number(row.amount) : null,
    phone: row.phone,
    network: row.network,
    status: row.status,
    mwPayoutId: row.mw_payout_id,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ---------------------------------------------------------------------------
// BONUS
// ---------------------------------------------------------------------------
// Colonnes réelles depuis la migration 014 (avant : tout en `data` JSONB).
// `criteria` reste JSONB : sous-objet {kind, target, period} lu d'un bloc.
const bonusToSupabase = data => {
  const { id, createdAt, type, name, description, criteria, fastFoodId, fastFoodName, active, requiresRewardCredentials, requiresProfile, claimDuration, usageLimit, createdBy, ...rest } = data;

  return {
    id,
    type: type ?? null,
    name: name ?? null,
    description: description ?? null,
    criteria: criteria ?? {},
    fastfood_id: fastFoodId ?? null,
    fastfood_name: fastFoodName ?? null,
    active: active ?? true,
    requires_reward_credentials: requiresRewardCredentials ?? false,
    requires_profile: requiresProfile ?? false,
    claim_duration: claimDuration ?? null,
    usage_limit: usageLimit ?? null,
    created_by: createdBy ?? null,
    extra_data: rest,
    created_at: toIso(createdAt),
  };
};

const bonusFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    criteria: row.criteria || {},
    fastFoodId: row.fastfood_id,
    fastFoodName: row.fastfood_name,
    active: row.active ?? true,
    requiresRewardCredentials: row.requires_reward_credentials ?? false,
    requiresProfile: row.requires_profile ?? false,
    claimDuration: row.claim_duration,
    usageLimit: row.usage_limit,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(row.extra_data || {}),
  };
};

// ---------------------------------------------------------------------------
// BONUS REQUESTS
// ---------------------------------------------------------------------------
// code / usageCount / redeemed sont des colonnes réelles depuis la migration 014
// (avant : dans extra_data, d'où un findByCode non indexé qui scannait la table).
const bonusRequestToSupabase = data => {
  const { createdAt, updatedAt, ...rest } = data;
  const known = ['id', 'userId', 'bonusId', 'bonusType', 'status', 'code', 'usageCount', 'redeemed', 'armed'];
  const extra_data = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra_data[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    bonus_id: data.bonusId,
    bonus_type: data.bonusType ?? null,
    status: data.status ?? [],
    code: data.code ?? null,
    usage_count: data.usageCount ?? 0,
    redeemed: data.redeemed ?? false,
    armed: data.armed ?? false,
    extra_data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt) || toIso(createdAt),
  };
};

const bonusRequestFromSupabase = row => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    bonusId: row.bonus_id,
    bonusType: row.bonus_type,
    status: row.status || [],
    code: row.code ?? null,
    usageCount: row.usage_count ?? 0,
    redeemed: row.redeemed ?? false,
    armed: row.armed ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
  };
};

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

module.exports = {
  toIso,
  toDate,
  user: { toSupabase: userToSupabase, fromSupabase: userFromSupabase },
  fastfood: { toSupabase: fastfoodToSupabase, fromSupabase: fastfoodFromSupabase },
  menu: { toSupabase: menuToSupabase, fromSupabase: menuFromSupabase },
  rating: { fromSupabase: ratingFromSupabase },
  order: { toSupabase: orderToSupabase, fromSupabase: orderFromSupabase },
  transaction: { toSupabase: transactionToSupabase, fromSupabase: transactionFromSupabase },
  withdrawal: { toSupabase: withdrawalToSupabase, fromSupabase: withdrawalFromSupabase },
  bonus: { toSupabase: bonusToSupabase, fromSupabase: bonusFromSupabase },
  bonusRequest: { toSupabase: bonusRequestToSupabase, fromSupabase: bonusRequestFromSupabase },
  notification: { toSupabase: notificationToSupabase, fromSupabase: notificationFromSupabase },
  driverApplication: { toSupabase: driverApplicationToSupabase, fromSupabase: driverApplicationFromSupabase },
};
