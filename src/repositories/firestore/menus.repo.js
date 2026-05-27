// ============================================================================
// Menus Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'menus';

exports.create = async (data) => {
  const menuData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  const docRef = await db.collection(TABLE).add(menuData);
  return { id: docRef.id, ...menuData };
};

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

exports.update = async (id, fields) => {
  const ref = db.collection(TABLE).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ ...fields, updatedAt: new Date().toISOString() });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
};

exports.updateStock = async (id, newStock) => {
  const ref = db.collection(TABLE).doc(id);
  await ref.update({ stock: newStock, updatedAt: new Date().toISOString() });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
};

exports.delete = async (id) => {
  await db.collection(TABLE).doc(id).delete();
};
