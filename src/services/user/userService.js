// src/services/userService.js
const { db } = require('../../config/firebase');

exports.getAllUsers = async () => {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

exports.getUserById = async id => {
  const doc = await db.collection('users').doc(id).get();
  if (!doc.exists) throw new Error(`Aucun utilisateur trouvé avec l'ID : ${id}`);
  return { id: doc.id, ...doc.data() };
};

exports.createUser = async data => {
  const userId = data.uid || data.id;
  if (userId) {
    await db.collection('users').doc(userId).set({ ...data, createdAt: new Date().toISOString() });
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
  const snapshot = await db.collection('users').where('user.infos.email', '==', email).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

exports.getUserByPhone = async phone => {
  const snapshot = await db.collection('users').where('user.infos.numero', '==', parseInt(phone)).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};
