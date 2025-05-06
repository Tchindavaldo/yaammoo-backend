// services/order/getOrdersService.js
const { db } = require('../../config/firebase');

exports.getFastFoodService = async fastFoodId => {
  try {
    const fastfoodDoc = await db.collection('fastfoods').doc(fastFoodId).get();
    if (!fastfoodDoc.exists) throw new Error('Fastfood non trouvé');

    return { id: fastfoodDoc.id, ...fastfoodDoc.data() };
  } catch (error) {
    // console.error('Erreur dans getFastfood:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
