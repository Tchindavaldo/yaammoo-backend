// services/order/getUserOrdersService.js
const { db } = require('../../config/firebase');

exports.getUserOrdersService = async userId => {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new Error('user non trouvé');

    const ordersSnapshot = await db.collection('orders').where('userId', '==', userId).orderBy('createdAt', 'desc').get();
    return ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erreur dans getUserOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
