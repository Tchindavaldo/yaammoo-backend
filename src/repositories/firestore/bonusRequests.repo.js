// ============================================================================
// Bonus Requests Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'bonusRequest';

exports.create = async (data) => {
  const reqData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  const docRef = await db.collection(TABLE).add(reqData);
  return { id: docRef.id, ...reqData };
};

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

exports.getAll = async () => {
  const snap = await db.collection(TABLE).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

exports.findByUserBonus = async ({ userId, bonusId, bonusType }) => {
  let q = db.collection(TABLE).where('bonusId', '==', bonusId).where('userId', '==', userId);
  if (bonusType) q = q.where('bonusType', '==', bonusType);
  const snap = await q.limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
};

exports.updateStatus = async (id, statusArray) => {
  await db.collection(TABLE).doc(id).update({ status: statusArray, updatedAt: new Date().toISOString() });
  const updated = await db.collection(TABLE).doc(id).get();
  return { id: updated.id, ...updated.data() };
};
