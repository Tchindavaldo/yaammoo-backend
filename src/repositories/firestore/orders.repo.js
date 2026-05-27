// ============================================================================
// Orders Repository — Firestore
// ============================================================================
const { db, admin } = require('../../config/firebase');
const FieldValue = admin.firestore.FieldValue;

const TABLE = 'orders';

const counterDocId = (fastFoodId, deliveryDate, status) =>
  `${fastFoodId}_${deliveryDate}_${status}`;

const counterRef = (fastFoodId, deliveryDate, status) =>
  db.collection('rankCounters').doc(counterDocId(fastFoodId, deliveryDate, status));

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

exports.getByFastFood = async (fastFoodId) => {
  const snap = await db
    .collection(TABLE)
    .where('fastFoodId', '==', fastFoodId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

exports.getByUser = async (userId) => {
  const snap = await db
    .collection(TABLE)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Query flexible : filtres optionnels { fastFoodId, userId, status (string ou array) }
 * + tri optionnel par createdAt asc.
 */
exports.query = async ({ fastFoodId, userId, status, orderByCreated = 'desc' } = {}) => {
  let q = db.collection(TABLE);
  if (fastFoodId) q = q.where('fastFoodId', '==', fastFoodId);
  if (userId) q = q.where('userId', '==', userId);
  if (status) {
    if (Array.isArray(status)) q = q.where('status', 'in', status);
    else q = q.where('status', '==', status);
  }
  if (orderByCreated) q = q.orderBy('createdAt', orderByCreated);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Création avec stock check + ranking. Reproduit la logique de l'ancien
 * createOrder.js (modulo le rollback explicite côté caller).
 */
exports.createWithStockCheck = async (order) => {
  const orderData = { ...order, createdAt: new Date().toISOString() };

  if (order.status === 'pending') {
    const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];
    orderData.rank = await exports.reserveRank({
      fastFoodId: order.fastFoodId,
      deliveryDate,
      status: 'pending',
    });
  }

  const orderRef = await db.collection(TABLE).add(orderData);
  const orderId = orderRef.id;

  let newStock;
  if (order.status === 'pending' && order.menu?.id) {
    const menuRef = db.collection('menus').doc(order.menu.id);
    const menuDoc = await menuRef.get();
    if (menuDoc.exists) {
      const menuData = menuDoc.data();
      if (typeof menuData.stock === 'number') {
        const qty = Number(order.quantity) || 1;
        if (menuData.stock < qty) {
          await db.collection(TABLE).doc(orderId).delete();
          return { error: `Stock insuffisant. Stock disponible : ${menuData.stock}` };
        }
        newStock = menuData.stock - qty;
        await menuRef.update({ stock: newStock, updatedAt: new Date().toISOString() });
      }
    }
  }

  return { order: { id: orderId, ...orderData }, newStock };
};

exports.update = async (id, fields) => {
  const ref = db.collection(TABLE).doc(id);
  // Gestion des suppressions de champs : { __delete: ['rank', 'clientId', ...] }
  const payload = { ...fields };
  if (payload.__delete) {
    for (const k of payload.__delete) payload[k] = FieldValue.delete();
    delete payload.__delete;
  }
  payload.updatedAt = payload.updatedAt || new Date().toISOString();
  await ref.update(payload);
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
};

exports.delete = async (id) => {
  await db.collection(TABLE).doc(id).delete();
};

// ===== Ranking =====

exports.reserveRank = async ({ fastFoodId, deliveryDate, status }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);
  return db.runTransaction(async (t) => {
    const snap = await t.get(cRef);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const newRank = current + 1;
    const now = new Date().toISOString();
    t.set(cRef, { value: newRank, updatedAt: now }, { merge: true });
    return newRank;
  });
};

exports.assignRank = async ({ orderId, fastFoodId, deliveryDate, status }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);
  const orderRef = db.collection(TABLE).doc(orderId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(cRef);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const newRank = current + 1;
    const now = new Date().toISOString();
    t.set(cRef, { value: newRank, updatedAt: now }, { merge: true });
    t.update(orderRef, { rank: newRank, updatedAt: now });
    return newRank;
  });
};

/**
 * Reindex queue après retrait de commandes.
 * Retourne la liste des commandes mises à jour.
 */
exports.reindexQueue = async ({ fastFoodId, deliveryDate, status, removedRanks }) => {
  if (!fastFoodId || !deliveryDate || !status) return [];

  let ranks = Array.isArray(removedRanks) ? removedRanks : [removedRanks];
  ranks = ranks.map(Number).filter((r) => !isNaN(r) && r > 0).sort((a, b) => a - b);
  if (ranks.length === 0) return [];
  const minRank = ranks[0];

  const ordersRef = db.collection(TABLE);
  const snapshot = await ordersRef
    .where('fastFoodId', '==', fastFoodId)
    .where('status', '==', status)
    .where('delivery.date', '==', deliveryDate)
    .get();

  const updatedOrders = [];
  if (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const rank = data.rank;
      if (typeof rank !== 'number' || rank <= minRank) return;
      let decrement = 0;
      for (const r of ranks) {
        if (r < rank) decrement++;
        else break;
      }
      if (decrement === 0) return;
      const newRank = rank - decrement;
      batch.update(doc.ref, { rank: newRank, updatedAt: new Date().toISOString() });
      updatedOrders.push({
        id: doc.id,
        userId: data.userId,
        rank: newRank,
        status: data.status,
        delivery: data.delivery,
      });
    });
    if (updatedOrders.length > 0) await batch.commit();
  }

  // Décrément du compteur
  const cRef = counterRef(fastFoodId, deliveryDate, status);
  await db.runTransaction(async (t) => {
    const snap = await t.get(cRef);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const next = Math.max(0, current - ranks.length);
    t.set(cRef, { value: next, updatedAt: new Date().toISOString() }, { merge: true });
  });

  return updatedOrders;
};

exports.resetCounter = async ({ fastFoodId, deliveryDate, status, value }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);
  await cRef.set({ value: value || 0, updatedAt: new Date().toISOString() }, { merge: true });
};
