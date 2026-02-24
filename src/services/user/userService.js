// src/services/userService.js
const { db } = require('../../config/firebase');

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
  // console.log('data update', data);
  await db.collection('users').doc(id).set(data, { merge: true });
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
