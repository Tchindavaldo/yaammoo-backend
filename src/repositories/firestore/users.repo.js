// ============================================================================
// Users Repository — Firestore (wrapper sur le code existant)
// ============================================================================
const { db } = require('../../config/firebase');

const TABLE = 'users';

const findUserDoc = async (id) => {
  let snap = await db.collection(TABLE).doc(id).get();
  if (snap.exists) return snap;
  const q = await db.collection(TABLE).where('uid', '==', id).get();
  if (q.empty) return null;
  return q.docs[0];
};

exports.getAllUsers = async () => {
  const snapshot = await db.collection(TABLE).get();
  return snapshot.docs.map((doc) => {
    const rawData = doc.data();
    const uid = rawData.uid || rawData.infos?.uid || doc.id;
    return { id: doc.id, uid, ...rawData };
  });
};

exports.getUserById = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) throw new Error(`Aucun utilisateur trouvé avec l'ID : ${id}`);
  const rawData = doc.data();
  const uid = rawData.uid || rawData.infos?.uid || doc.id;
  return { id: doc.id, uid, ...rawData };
};

exports.getUserByIdSafe = async (id) => {
  const doc = await db.collection(TABLE).doc(id).get();
  if (!doc.exists) return null;
  const rawData = doc.data();
  const uid = rawData.uid || rawData.infos?.uid || doc.id;
  return { id: doc.id, uid, ...rawData };
};

exports.createUser = async (data) => {
  const userId = data.uid || data.id;
  if (userId) {
    await db
      .collection(TABLE)
      .doc(userId)
      .set({ ...data, createdAt: new Date().toISOString() });
    return userId;
  }
  const newRef = await db
    .collection(TABLE)
    .add({ ...data, createdAt: new Date().toISOString() });
  return newRef.id;
};

exports.saveUser = async (id, data) => {
  await db.collection(TABLE).doc(id).set(data, { merge: true });
};

exports.updateUser = async (id, data) => {
  if (!data || Object.keys(data).length === 0) return;
  await db.collection(TABLE).doc(id).set(data, { merge: true });
};

exports.addPushToken = async (userId, { token, platform, deviceId }) => {
  if (!token || !platform || !deviceId) throw new Error('token, platform et deviceId sont requis');
  if (platform !== 'ios' && platform !== 'android') throw new Error('platform doit être "ios" ou "android"');

  const userDoc = await findUserDoc(userId);
  if (!userDoc) throw new Error(`Utilisateur ${userId} introuvable`);

  const data = userDoc.data();
  const existing = Array.isArray(data.pushTokens) ? data.pushTokens : [];
  const filtered = existing.filter((e) => e && e.deviceId !== deviceId);
  filtered.push({ token, platform, deviceId, lastSeen: new Date().toISOString() });

  await userDoc.ref.update({ pushTokens: filtered });
  return { count: filtered.length };
};

exports.removePushToken = async (userId, { deviceId }) => {
  if (!deviceId) throw new Error('deviceId requis');
  const userDoc = await findUserDoc(userId);
  if (!userDoc) throw new Error(`Utilisateur ${userId} introuvable`);
  const data = userDoc.data();
  const existing = Array.isArray(data.pushTokens) ? data.pushTokens : [];
  const removed = existing.filter((e) => e && e.deviceId === deviceId);
  const filtered = existing.filter((e) => e && e.deviceId !== deviceId);
  if (removed.length === 0) return { removed: 0, count: existing.length };
  await userDoc.ref.update({ pushTokens: filtered });
  return { removed: removed.length, count: filtered.length };
};

exports.cleanStaleTokens = async (userId, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    const userRef = db.collection(TABLE).doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (Array.isArray(data.pushTokens)) {
      const filtered = data.pushTokens.filter((e) => e && !staleTokens.includes(e.token));
      await userRef.update({ pushTokens: filtered });
    }
  } catch (e) {
    console.warn('[users.firestore] cleanStaleTokens error:', e.message);
  }
};

exports.getUserByEmail = async (email) => {
  const snapshot = await db.collection(TABLE).where('infos.email', '==', email).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const rawData = doc.data();
  const uid = rawData.uid || rawData.infos?.uid || doc.id;
  return { id: doc.id, uid, ...rawData };
};

exports.getUserByPhone = async (phone) => {
  const snapshot = await db
    .collection(TABLE)
    .where('infos.numero', '==', parseInt(phone))
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const rawData = doc.data();
  const uid = rawData.uid || rawData.infos?.uid || doc.id;
  return { id: doc.id, uid, ...rawData };
};
