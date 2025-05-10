// src/services/userService.js
const { db, admin } = require('../../config/firebase');

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
  const newUserRef = await db.collection('users').add({ ...data, createdAt: new Date().toISOString() });
  return newUserRef.id;
};

exports.updateUser = async (id, data) => {
  console.log('data update', data);
  await db.collection('users').doc(id).update(data);
};
