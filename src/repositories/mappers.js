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

const { toIso, toDate } = require('./mapperUtils');

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
  const known = ['id', 'userId', 'name', 'number', 'momoNumber', 'whatsappNumber', 'openTime', 'closeTime', 'image', 'orderLeadTime', 'advanceDays', 'pickupAllowed', 'cities', 'deliveryHours', 'platformDeliveryZones', 'deliveryBy', 'driverRatingAvg', 'driverRatingCount', 'openDays', 'isAvailable', 'available', 'latitude', 'longitude'];
  const extra = {};
  for (const k of Object.keys(rest)) {
    if (!known.includes(k)) extra[k] = rest[k];
  }
  return {
    id: data.id,
    user_id: data.userId,
    // Jours d'ouverture (migration 049) : 0 = dimanche … 6 = samedi (Date#getDay).
    open_days: data.openDays ?? ALL_DAYS,
    // Interrupteur MANUEL du marchand. `available` (lu) n'est jamais stocké.
    is_available: data.isAvailable ?? true,
    name: data.name ?? null,
    number: data.number ?? null,
    momo_number: data.momoNumber ?? null,
    whatsapp_number: data.whatsappNumber ?? null,
    open_time: data.openTime ?? null,
    close_time: data.closeTime ?? null,
    image: data.image ?? null,
    order_lead_time: data.orderLeadTime ?? null,
    advance_days: data.advanceDays ?? null,
    pickup_allowed: data.pickupAllowed ?? null,
    cities: data.cities ?? [],
    delivery_hours: data.deliveryHours ?? [],
    // Qui livre (migration 037) : 'fastfood' (régime historique) ou 'platform'.
    // Décidé par l'admin — jamais par la boutique elle-même.
    delivery_by: data.deliveryBy ?? 'fastfood',
    platform_delivery_zones: data.platformDeliveryZones ?? [],
    // Position de la boutique (migration 060), posée par le marchand.
    latitude: Number.isFinite(data.latitude) ? data.latitude : null,
    longitude: Number.isFinite(data.longitude) ? data.longitude : null,
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
    pickupAllowed: row.pickup_allowed ?? false,
    cities: row.cities || [],
    deliveryHours: row.delivery_hours || [],
    deliveryBy: row.delivery_by || 'fastfood',
    platformDeliveryZones: row.platform_delivery_zones || [],
    driverRatingAvg: row.driver_rating_avg != null ? Number(row.driver_rating_avg) : 0,
    driverRatingCount: row.driver_rating_count ?? 0,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.extra_data || {}),
    ...fastfoodAvailability(row),
  };
};

// Disponibilité CALCULÉE à chaque lecture (comme isMarchand, R5) : la boutique
// est disponible si le marchand ne l'a pas coupée ET qu'elle ouvre au moins un
// jour. Couper manuellement ne touche pas `openDays`.
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const fastfoodAvailability = row => {
  const openDays = Array.isArray(row.open_days) ? row.open_days : ALL_DAYS;
  const isAvailable = row.is_available ?? true;
  return { openDays, isAvailable, available: isAvailable && openDays.length > 0 };
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
  const known = ['id', 'userId', 'fastFoodId', 'quantity', 'extra', 'drink', 'delivery', 'total', 'status', 'rank', 'clientId', 'periodKey', 'driverId', 'groupId'];
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
    // Panier : commandes à réafficher ensemble (migration 022).
    group_id: data.groupId ?? null,
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
    groupId: row.group_id ?? undefined,
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
  // Fichiers dédiés, ce fichier dépassant le plafond R3 :
  // bonus + bonusRequest, puis notification / driverApplication / banner /
  // supportThread / supportMessage, puis employés (migration 050).
  ...require('./bonusMappers'),
  ...require('./contentMappers'),
  ...require('./staffMappers'),
};
