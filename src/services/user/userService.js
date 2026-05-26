// src/services/userService.js
const { db } = require('../../config/firebase');
const admin = require('firebase-admin');

exports.getAllUsers = async () => {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => {
    const rawData = doc.data();
    // Ensure uid is always at root level
    const uid = rawData.uid || rawData.infos?.uid || doc.id;
    return {
      id: doc.id,
      uid: uid,
      ...rawData,
    };
  });
};

exports.getUserById = async id => {
  const doc = await db.collection('users').doc(id).get();
  if (!doc.exists) throw new Error(`Aucun utilisateur trouvé avec l'ID : ${id}`);
  const rawData = doc.data();

  // Ensure uid is always at root level
  // Priority: rawData.uid > rawData.infos.uid > doc.id
  const uid = rawData.uid || rawData.infos?.uid || doc.id;

  const userData = {
    id: doc.id,
    uid: uid,
    ...rawData,
  };

  console.log('🔍 [getUserById] Returning user data for:', id);
  console.log('📦 [getUserById] userData.id:', userData.id);
  console.log('📦 [getUserById] userData.uid:', userData.uid);
  console.log('📦 [getUserById] userData.infos:', JSON.stringify(userData.infos));

  return userData;
};

exports.createUser = async data => {
  const userId = data.uid || data.id;
  if (userId) {
    await db
      .collection('users')
      .doc(userId)
      .set({ ...data, createdAt: new Date().toISOString() });
    return userId;
  }
  const newUserRef = await db.collection('users').add({ ...data, createdAt: new Date().toISOString() });
  return newUserRef.id;
};

exports.saveUser = async (id, data) => {
  await db.collection('users').doc(id).set(data, { merge: true });
};

exports.updateUser = async (id, data) => {
  const { fcmToken, ...rest } = data || {};
  const ref = db.collection('users').doc(id);

  if (Object.keys(rest).length > 0) {
    await ref.set(rest, { merge: true });
  }

  if (fcmToken && typeof fcmToken === 'string') {
    await ref.set(
      { fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken) },
      { merge: true }
    );
  }
};

exports.removeFcmToken = async (id, token) => {
  if (!token) return;
  await db.collection('users').doc(id).update({
    fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
  });
};

// ===== Push tokens multi-device =====

const findUserDoc = async (id) => {
  let snap = await db.collection('users').doc(id).get();
  if (snap.exists) return snap;
  const q = await db.collection('users').where('uid', '==', id).get();
  if (q.empty) return null;
  return q.docs[0];
};

// Upsert d'un token push lié à un device. Évite les doublons par deviceId.
exports.addPushToken = async (userId, { token, platform, deviceId }) => {
  if (!token || !platform || !deviceId) {
    throw new Error('token, platform et deviceId sont requis');
  }
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('platform doit être "ios" ou "android"');
  }

  const userDoc = await findUserDoc(userId);
  if (!userDoc) throw new Error(`Utilisateur ${userId} introuvable`);

  const data = userDoc.data();
  const existing = Array.isArray(data.pushTokens) ? data.pushTokens : [];
  // Retire toute entrée existante avec le même deviceId (refresh propre)
  const filtered = existing.filter(e => e && e.deviceId !== deviceId);
  filtered.push({
    token,
    platform,
    deviceId,
    lastSeen: new Date().toISOString(),
  });

  await userDoc.ref.update({ pushTokens: filtered });

  console.log(`✅ [PUSH-TOKEN] add ${platform} pour user=${userId} device=${deviceId} (total=${filtered.length})`);
  return { count: filtered.length };
};

// Supprime le token push correspondant à un device (logout).
exports.removePushToken = async (userId, { deviceId }) => {
  if (!deviceId) throw new Error('deviceId requis');

  const userDoc = await findUserDoc(userId);
  if (!userDoc) throw new Error(`Utilisateur ${userId} introuvable`);

  const data = userDoc.data();
  const existing = Array.isArray(data.pushTokens) ? data.pushTokens : [];
  const removed = existing.filter(e => e && e.deviceId === deviceId);
  const filtered = existing.filter(e => e && e.deviceId !== deviceId);

  if (removed.length === 0) {
    console.log(`ℹ️ [PUSH-TOKEN] remove: aucun token trouvé pour device=${deviceId}`);
    return { removed: 0, count: existing.length };
  }

  await userDoc.ref.update({ pushTokens: filtered });

  console.log(`🗑️ [PUSH-TOKEN] remove device=${deviceId} pour user=${userId} (reste=${filtered.length})`);
  return { removed: removed.length, count: filtered.length };
};

// Helper: agrège les tokens d'un user à partir de pushTokens (+ fallback legacy fcmTokens).
exports.collectUserTokens = (userData) => {
  const fcm = [];
  const apns = [];

  if (Array.isArray(userData.pushTokens)) {
    userData.pushTokens.forEach(e => {
      if (!e || !e.token) return;
      if (e.platform === 'ios') apns.push(e.token);
      else if (e.platform === 'android') fcm.push(e.token);
    });
  }

  // Fallback legacy : si pushTokens vide ou incomplet, lire fcmTokens
  if (Array.isArray(userData.fcmTokens)) {
    userData.fcmTokens.forEach(t => {
      if (t && !fcm.includes(t) && !apns.includes(t)) {
        // Sans info de platform, on assume FCM (Android/web FCM token)
        fcm.push(t);
      }
    });
  }

  return { fcm, apns };
};

exports.getUserByEmail = async email => {
  const snapshot = await db.collection('users').where('infos.email', '==', email).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const rawData = doc.data();

  // Ensure uid is always at root level
  const uid = rawData.uid || rawData.infos?.uid || doc.id;

  return {
    id: doc.id,
    uid: uid,
    ...rawData,
  };
};

exports.getUserByPhone = async phone => {
  const snapshot = await db.collection('users').where('infos.numero', '==', parseInt(phone)).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const rawData = doc.data();

  // Ensure uid is always at root level
  const uid = rawData.uid || rawData.infos?.uid || doc.id;

  return {
    id: doc.id,
    uid: uid,
    ...rawData,
  };
};
