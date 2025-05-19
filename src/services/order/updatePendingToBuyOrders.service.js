const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrderUpdate } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updatePendingToBuyOrders = async orders => {
  const io = getIO();

  // Force orders à être un tableau
  const updates = Array.isArray(orders) ? orders : [orders];
  const groupedByFastFood = {};
  const results = [];

  for (const updateData of updates) {
    const errors = validateOrderUpdate(updateData);
    if (errors.length > 0) {
      const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
      const error = new Error(`Erreur de validation pour la commande ${updateData.id || 'inconnue'}: ${formattedErrors}`);
      error.code = 400;
      throw error;
    }

    const { id, status, fastFoodId } = updateData;

    if (!id) {
      const error = new Error('ID de commande manquant pour une mise à jour.');
      error.code = 400;
      throw error;
    }

    const orderRef = db.collection('orders').doc(id);
    const doc = await orderRef.get();

    if (!doc.exists) {
      const error = new Error(`Commande non trouvée pour l'ID ${id}`);
      error.code = 404;
      throw error;
    }

    await orderRef.update({
      ...updateData,
      status: status === 'pendingToBuy' ? 'pending' : status,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await orderRef.get();
    const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };
    results.push(updatedOrder);

    // Regrouper par fastFoodId
    if (!groupedByFastFood[fastFoodId]) {
      groupedByFastFood[fastFoodId] = [];
    }
    groupedByFastFood[fastFoodId].push(updatedOrder);
  }

  for (const fastFoodId in groupedByFastFood) {
    try {
      const fastfood = await getFastFoodService(fastFoodId);
      if (!fastfood.userId) {
        console.warn(`userId manquant pour le fastfood ${fastFoodId}`);
        continue;
      }

      console.log('fast food user id', fastfood.userId);

      io.to(fastfood.userId).emit('newFastFoodOrders', {
        message: 'Nouvelle commande',
        data: groupedByFastFood[fastFoodId],
      });
    } catch (err) {
      console.warn(`Erreur lors de l'émission pour fastFoodId ${fastFoodId}: ${err.message}`);
      continue;
    }
  }

  return results;
};
