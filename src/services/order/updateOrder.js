// services/order/updateOrder.js
const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { updateOrders } = require('./updateOrders.service');

const RANKED_STATUSES = new Set(['pending', 'processing']);
const RANK_IMPACTING = new Set([
  'pendingToBuy',
  'pending',
  'processing',
  'cancelByUser',
  'cancelByFastFood',
]);

exports.updateOrderService = async (orderId, updateData) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return { success: false, message: 'Format de données invalide pour la mise à jour' };
  }

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const doc = await orderRef.get();

    if (!doc.exists) return { success: false, message: 'Commande non trouvée' };

    const prevData = doc.data();
    const prevStatus = prevData.status;
    const newStatus = updateData.status;

    // If the update touches a rank-impacting status transition, delegate to
    // updateOrders so rank assignment/reindexing runs consistently.
    const isRankedTransition =
      newStatus &&
      newStatus !== prevStatus &&
      (RANKED_STATUSES.has(prevStatus) || RANK_IMPACTING.has(newStatus));

    if (isRankedTransition) {
      const payload = {
        ...updateData,
        id: orderId,
        fastFoodId: updateData.fastFoodId || prevData.fastFoodId,
      };
      const userId = updateData.userId || prevData.userId;
      const result = await updateOrders([payload], userId);
      if (!result.success) return result;
      return { success: true, message: result.message, data: result.data?.[0] || null };
    }

    // Fallback: simple field update (no rank impact).
    const errors = validateOrder(updateData, false, true);
    if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour de la commande: ${errors}` };

    await orderRef.update({ ...updateData, updatedAt: new Date().toISOString() });

    const updatedDoc = await orderRef.get();
    const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

    const fastFood = await getFastFoodService(updatedOrder.fastFoodId);

    const io = getIO();
    io.to(updatedOrder.userId).emit('userOrderUpdated', { data: updatedOrder });
    if (fastFood?.userId) {
      io.to(fastFood.userId).emit('fastFoodOrderUpdated', { data: updatedOrder });
    }

    return { success: true, message: 'Commande mise à jour avec succès', data: updatedOrder };
  } catch (error) {
    console.error('Erreur dans updateOrderService:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour de la commande',
    };
  }
};
