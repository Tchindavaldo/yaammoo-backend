const { db } = require('../../config/firebase');

exports.getOrdersService = async fastfoodId => {
  try {
    const fastfoodDoc = await db.collection('fastfoods').doc(fastfoodId).get();
    if (!fastfoodDoc.exists) throw new Error('Fastfood non trouvé');

    const ordersSnapshot = await db.collection('fastfoods').doc(fastfoodId).collection('orders').orderBy('createdAt', 'desc').get();
    return ordersSnapshot.docs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erreur dans getOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
