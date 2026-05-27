// ============================================================================
// Fastfoods Repository — Firestore
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'fastfoods';

exports.create = async (data) => {
  const fastfoodData = { ...data, createdAt: data.createdAt || new Date().toISOString() };
  // Vérification unicité par userId
  const existing = await db.collection(TABLE).where('userId', '==', data.userId).get();
  if (!existing.empty) {
    const e = new Error('Cet utilisateur possède déjà un fastfood.');
    e.code = 400;
    throw e;
  }
  const docRef = await db.collection(TABLE).add(fastfoodData);
  return { id: docRef.id, ...fastfoodData };
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

exports.getByUserId = async (userId) => {
  const snap = await db.collection(TABLE).where('userId', '==', userId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
};

exports.update = async (id, fields) => {
  const ref = db.collection(TABLE).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    const e = new Error('Fastfood non trouvé');
    e.code = 404;
    throw e;
  }
  await ref.update({ ...fields, updatedAt: new Date().toISOString() });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
};

exports.exists = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  return doc.exists;
};
