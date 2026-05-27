// ============================================================================
// Bonus Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'bonus';

exports.create = async (data) => {
  const bonusData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  const docRef = await db.collection(TABLE).add(bonusData);
  return { id: docRef.id, ...bonusData };
};

exports.getAll = async () => {
  const snap = await db.collection(TABLE).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};
