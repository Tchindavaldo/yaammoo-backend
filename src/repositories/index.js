// ============================================================================
// Repository Orchestrator — Dual-write / Read switching
// ============================================================================
// API unique exposée aux services métier. Le code service appelle :
//
//   const repos = require('../../repositories');
//   await repos.users.createUser(data);
//
// Et l'orchestrateur route vers Firestore, Supabase, ou les deux selon
// DB_PROVIDER + DB_READ_FROM (voir config/dbProvider.js).
//
// Règle d'or :
//   * READS  → vont sur readFrom (firestore ou supabase, pas les deux)
//   * WRITES → vont sur tous les providers actifs (dual-write)
//   * Le résultat retourné est toujours celui du READ provider (cohérence)
//
// Erreur de l'un des writes secondaires en mode dual : log warn, ne fail PAS
// le write principal. C'est volontaire pour éviter qu'une panne Supabase
// pendant la migration fasse tomber le service principal Firestore.
// ============================================================================

const cfg = require('../config/dbProvider');

const fs = {
  users: require('./firestore/users.repo'),
  fastfoods: require('./firestore/fastfoods.repo'),
  menus: require('./firestore/menus.repo'),
  orders: require('./firestore/orders.repo'),
  transactions: require('./firestore/transactions.repo'),
  bonus: require('./firestore/bonus.repo'),
  bonusRequests: require('./firestore/bonusRequests.repo'),
  notifications: require('./firestore/notifications.repo'),
};

const sb = {
  users: require('./supabase/users.repo'),
  fastfoods: require('./supabase/fastfoods.repo'),
  menus: require('./supabase/menus.repo'),
  orders: require('./supabase/orders.repo'),
  transactions: require('./supabase/transactions.repo'),
  bonus: require('./supabase/bonus.repo'),
  bonusRequests: require('./supabase/bonusRequests.repo'),
  notifications: require('./supabase/notifications.repo'),
};

// ---------------------------------------------------------------------------
// Helper : exécute un write sur les providers actifs, retourne le résultat
// du provider de lecture (cohérence avec les reads ultérieurs).
// ---------------------------------------------------------------------------
const dualWrite = async (fsCall, sbCall, primary = cfg.readFrom) => {
  const promises = [];
  let fsResult, sbResult;

  if (cfg.useFirestoreWrite && fsCall) {
    promises.push(
      Promise.resolve()
        .then(() => fsCall())
        .then((r) => (fsResult = r))
        .catch((e) => {
          if (primary === 'firestore') throw e;
          console.warn('[repos.dualWrite] Firestore secondary write failed:', e.message);
        })
    );
  }

  if (cfg.useSupabaseWrite && sbCall) {
    promises.push(
      Promise.resolve()
        .then(() => sbCall())
        .then((r) => (sbResult = r))
        .catch((e) => {
          if (primary === 'supabase') throw e;
          console.warn('[repos.dualWrite] Supabase secondary write failed:', e.message);
        })
    );
  }

  await Promise.all(promises);
  return primary === 'supabase' ? sbResult : fsResult;
};

// ---------------------------------------------------------------------------
// Helper : exécute un read sur le provider configuré.
// ---------------------------------------------------------------------------
const read = (fsCall, sbCall) => {
  if (cfg.useSupabaseRead) return sbCall();
  return fsCall();
};

// ===========================================================================
// USERS
// ===========================================================================
const users = {
  getAllUsers: () => read(fs.users.getAllUsers, sb.users.getAllUsers),
  getUserById: (id) => read(() => fs.users.getUserById(id), () => sb.users.getUserById(id)),
  getUserByIdSafe: (id) =>
    read(() => fs.users.getUserByIdSafe(id), () => sb.users.getUserByIdSafe(id)),
  getUserByEmail: (email) =>
    read(() => fs.users.getUserByEmail(email), () => sb.users.getUserByEmail(email)),
  getUserByPhone: (phone) =>
    read(() => fs.users.getUserByPhone(phone), () => sb.users.getUserByPhone(phone)),
  createUser: (data) =>
    dualWrite(() => fs.users.createUser(data), () => sb.users.createUser(data)),
  saveUser: (id, data) =>
    dualWrite(() => fs.users.saveUser(id, data), () => sb.users.saveUser(id, data)),
  updateUser: (id, data) =>
    dualWrite(() => fs.users.updateUser(id, data), () => sb.users.updateUser(id, data)),
  removeFcmToken: (id, token) =>
    dualWrite(() => fs.users.removeFcmToken(id, token), () => sb.users.removeFcmToken(id, token)),
  addPushToken: (userId, payload) =>
    dualWrite(() => fs.users.addPushToken(userId, payload), () => sb.users.addPushToken(userId, payload)),
  removePushToken: (userId, payload) =>
    dualWrite(() => fs.users.removePushToken(userId, payload), () => sb.users.removePushToken(userId, payload)),
  cleanStaleTokens: (userId, staleTokens) =>
    dualWrite(() => fs.users.cleanStaleTokens(userId, staleTokens), () => sb.users.cleanStaleTokens(userId, staleTokens)),
  collectUserTokens: (userData) => {
    const fcm = [];
    const apns = [];
    if (Array.isArray(userData.pushTokens)) {
      userData.pushTokens.forEach((e) => {
        if (!e || !e.token) return;
        if (e.platform === 'ios') apns.push(e.token);
        else if (e.platform === 'android') fcm.push(e.token);
      });
    }
    if (Array.isArray(userData.fcmTokens)) {
      userData.fcmTokens.forEach((t) => {
        if (t && !fcm.includes(t) && !apns.includes(t)) fcm.push(t);
      });
    }
    return { fcm, apns };
  },
};

// ===========================================================================
// FASTFOODS
// ===========================================================================
const fastfoods = {
  getById: (id) => read(() => fs.fastfoods.getById(id), () => sb.fastfoods.getById(id)),
  getAll: () => read(fs.fastfoods.getAll, sb.fastfoods.getAll),
  getByUserId: (userId) =>
    read(() => fs.fastfoods.getByUserId(userId), () => sb.fastfoods.getByUserId(userId)),
  exists: (id) => read(() => fs.fastfoods.exists(id), () => sb.fastfoods.exists(id)),
  create: (data) => dualWrite(() => fs.fastfoods.create(data), () => sb.fastfoods.create(data)),
  update: (id, fields) =>
    dualWrite(() => fs.fastfoods.update(id, fields), () => sb.fastfoods.update(id, fields)),
};

// ===========================================================================
// MENUS
// ===========================================================================
const menus = {
  getById: (id) => read(() => fs.menus.getById(id), () => sb.menus.getById(id)),
  getByFastFood: (fastFoodId) =>
    read(() => fs.menus.getByFastFood(fastFoodId), () => sb.menus.getByFastFood(fastFoodId)),
  create: (data) => dualWrite(() => fs.menus.create(data), () => sb.menus.create(data)),
  update: (id, fields) =>
    dualWrite(() => fs.menus.update(id, fields), () => sb.menus.update(id, fields)),
  updateStock: (id, newStock) =>
    dualWrite(() => fs.menus.updateStock(id, newStock), () => sb.menus.updateStock(id, newStock)),
  delete: (id) => dualWrite(() => fs.menus.delete(id), () => sb.menus.delete(id)),
};

// ===========================================================================
// ORDERS
// ===========================================================================
// Note importante : pour les opérations atomiques (createWithStockCheck,
// reserveRank, assignRank, reindexQueue), le dual-write est plus délicat car
// les deux backends doivent rester cohérents. On accepte que les valeurs
// retournées (rank par exemple) puissent légèrement diverger entre les deux
// DBs en mode dual — c'est attendu, c'est juste pendant la transition.
const orders = {
  getById: (id) => read(() => fs.orders.getById(id), () => sb.orders.getById(id)),
  getByFastFood: (fastFoodId) =>
    read(() => fs.orders.getByFastFood(fastFoodId), () => sb.orders.getByFastFood(fastFoodId)),
  getByUser: (userId) =>
    read(() => fs.orders.getByUser(userId), () => sb.orders.getByUser(userId)),

  query: (params) =>
    read(() => fs.orders.query(params), () => sb.orders.query(params)),

  createWithStockCheck: (order) =>
    dualWrite(
      () => fs.orders.createWithStockCheck(order),
      () => sb.orders.createWithStockCheck(order)
    ),

  update: (id, fields) =>
    dualWrite(() => fs.orders.update(id, fields), () => sb.orders.update(id, fields)),

  delete: (id) => dualWrite(() => fs.orders.delete(id), () => sb.orders.delete(id)),

  reserveRank: (params) =>
    dualWrite(() => fs.orders.reserveRank(params), () => sb.orders.reserveRank(params)),

  assignRank: (params) =>
    dualWrite(() => fs.orders.assignRank(params), () => sb.orders.assignRank(params)),

  reindexQueue: (params) =>
    dualWrite(() => fs.orders.reindexQueue(params), () => sb.orders.reindexQueue(params)),

  resetCounter: (params) =>
    dualWrite(() => fs.orders.resetCounter(params), () => sb.orders.resetCounter(params)),
};

// ===========================================================================
// TRANSACTIONS
// ===========================================================================
const transactions = {
  getById: (id) => read(() => fs.transactions.getById(id), () => sb.transactions.getById(id)),
  getByUser: (userId) =>
    read(() => fs.transactions.getByUser(userId), () => sb.transactions.getByUser(userId)),
  create: (data) => dualWrite(() => fs.transactions.create(data), () => sb.transactions.create(data)),
};

// ===========================================================================
// BONUS
// ===========================================================================
const bonus = {
  getAll: () => read(fs.bonus.getAll, sb.bonus.getAll),
  getById: (id) => read(() => fs.bonus.getById(id), () => sb.bonus.getById(id)),
  create: (data) => dualWrite(() => fs.bonus.create(data), () => sb.bonus.create(data)),
};

// ===========================================================================
// BONUS REQUESTS
// ===========================================================================
const bonusRequests = {
  getById: (id) => read(() => fs.bonusRequests.getById(id), () => sb.bonusRequests.getById(id)),
  getAll: () => read(fs.bonusRequests.getAll, sb.bonusRequests.getAll),
  findByUserBonus: (params) =>
    read(() => fs.bonusRequests.findByUserBonus(params), () => sb.bonusRequests.findByUserBonus(params)),
  create: (data) => dualWrite(() => fs.bonusRequests.create(data), () => sb.bonusRequests.create(data)),
  updateStatus: (id, statusArray) =>
    dualWrite(
      () => fs.bonusRequests.updateStatus(id, statusArray),
      () => sb.bonusRequests.updateStatus(id, statusArray)
    ),
};

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================
const notifications = {
  getGroupForUser: (userId) =>
    read(() => fs.notifications.getGroupForUser(userId), () => sb.notifications.getGroupForUser(userId)),
  getGroupForFastFood: (fastFoodId) =>
    read(() => fs.notifications.getGroupForFastFood(fastFoodId), () => sb.notifications.getGroupForFastFood(fastFoodId)),
  getById: (id) => read(() => fs.notifications.getById(id), () => sb.notifications.getById(id)),
  getAllForTarget: (target) =>
    read(() => fs.notifications.getAllForTarget(target), () => sb.notifications.getAllForTarget(target)),
  getAllForUser: (userId) =>
    read(() => fs.notifications.getAllForUser(userId), () => sb.notifications.getAllForUser(userId)),
  appendNotification: (params) =>
    dualWrite(
      () => fs.notifications.appendNotification(params),
      () => sb.notifications.appendNotification(params)
    ),
  markAsRead: (params) =>
    dualWrite(
      () => fs.notifications.markAsRead(params),
      () => sb.notifications.markAsRead(params)
    ),
  generateNotifId: () =>
    cfg.useFirestoreRead ? fs.notifications.generateNotifId() : sb.notifications.generateNotifId(),
};

module.exports = {
  config: cfg,
  users,
  fastfoods,
  menus,
  orders,
  transactions,
  bonus,
  bonusRequests,
  notifications,
  supabase: sb,
  firestore: fs,
  dualWrite,
  read,
};
