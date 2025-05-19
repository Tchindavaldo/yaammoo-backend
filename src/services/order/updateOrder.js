// services/order/updateOrder.js
const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateOrderService = async (orderId, updateData) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) return { success: false, message: 'Format de données invalide pour la mise à jour' };

  const errors = validateOrder(updateData, false, true);
  if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour de la commande: ${errors}` };

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return { success: false, message: 'Commande non trouvée' };
    }

    const updatedFields = { ...updateData };

    await orderRef.update({ ...updatedFields, updatedAt: new Date().toISOString() });

    const updatedDoc = await orderRef.get();
    const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

    const fastFood = await getFastFoodService(updatedOrder.fastFoodId);

    const io = getIO();
    io.to(updatedOrder.userId).emit('userOrderUpdated', { order: updatedOrder });
    io.to(fastFood.userId).emit('fastFoodOrderUpdated', { order: updatedOrder });

    return { success: true, message: 'Commande mise à jour avec succès', data: updatedOrder };
  } catch (error) {
    console.error('Erreur dans updateOrderService:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour de la commande',
    };
  }
};
