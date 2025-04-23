// src/services/userService.js
const 
{
    db, admin } = require('../config/firebase');

exports.getAllUsers = async () => 
{
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => (
{
    id: doc.id, ...doc.data() }));
};

exports.createUser = async (data) => 
{
    const newUserRef = await db.collection('users').add(
{
    ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return newUserRef.id;
};

exports.updateUser = async (id, data) => 
{
    await db.collection('users').doc(id).update(data);
};
