// services/order/getOrdersService.js
const { db } = require('../../config/firebase');

exports.getOrdersService = async fastFoodId => {
  try {
    const fastfoodDoc = await db.collection('fastfoods').doc(fastFoodId).get();
    if (!fastfoodDoc.exists) throw new Error('Fastfood non trouvé');

    const ordersSnapshot = await db.collection('orders').where('fastFoodId', '==', fastFoodId).orderBy('createdAt', 'desc').get();
    return ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erreur dans getOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
