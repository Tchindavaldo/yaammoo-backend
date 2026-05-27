// ============================================================================
// Transactions Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

// Note : la collection s'appelle 'transaction' (singulier) en Firestore.
const TABLE = 'transaction';

exports.create = async (data) => {
  const txData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  const docRef = await db.collection(TABLE).add(txData);
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() };
};

exports.getById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

exports.getByUser = async (userId) => {
  const snap = await db
    .collection(TABLE)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
