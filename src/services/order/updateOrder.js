// ============================================================================
// updateOrderService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { updateOrders } = require('./updateOrders.service');
const { assignDriver, driverAdvanceStatus } = require('./driverOrders.service');
const { reliableEmit } = require('../../utils/reliableEmit');
const { emitBonusStats } = require('../bonus/emitBonusStats');

const RANKED_STATUSES = new Set(['pending', 'processing']);
const RANK_IMPACTING = new Set(['pendingToBuy', 'pending', 'processing', 'cancelByUser', 'cancelByFastFood']);

exports.updateOrderService = async (orderId, updateData) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return { success: false, message: 'Format de données invalide pour la mise à jour' };
  }

  try {
    const prevData = await repos.orders.getById(orderId);
    if (!prevData) return { success: false, message: 'Commande non trouvée' };

    const prevStatus = prevData.status;
    const newStatus = updateData.status;

    // --- Délégation livreur (driver) ---
    // Déclenché dès que le payload porte un driverId. Le front N'ENVOIE PAS de statut.
    if (updateData.driverId !== undefined) {
      // Déjà assignée à CE livreur → il fait avancer la commande (machine à états auto).
      if (prevData.driverId && prevData.driverId === updateData.driverId) {
        return driverAdvanceStatus(orderId, updateData.driverId, prevData);
      }
      // Sinon → (ré)assignation d'un livreur par le fastFood.
      return assignDriver(orderId, updateData.driverId, prevData);
    }

    // Si transition impactant le rank, on délègue à updateOrders pour cohérence
    const isRankedTransition = newStatus && newStatus !== prevStatus && (RANKED_STATUSES.has(prevStatus) || RANK_IMPACTING.has(newStatus));

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

    // Fallback : simple update sans rank impact
    const errors = validateOrder(updateData, false, true);
    if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour de la commande: ${errors}` };

    const updatedOrder = await repos.orders.update(orderId, updateData);

    const fastFood = await getFastFoodService(updatedOrder.fastFoodId);
    const io = getIO();
    await reliableEmit(io, updatedOrder.userId, 'userOrderUpdated', { data: updatedOrder });
    if (fastFood?.userId) {
      await reliableEmit(io, fastFood.userId, 'fastFoodOrderUpdated', { data: updatedOrder });
    }

    // Une annulation sort la commande du solde bonus (statuts exclus du brut) :
    // on repousse les soldes recalculés si le statut a changé.
    if (updateData.status && updateData.status !== prevData.status && updatedOrder.userId) {
      emitBonusStats(updatedOrder.userId).catch((e) => console.warn('[updateOrder] emitBonusStats:', e.message));
    }

    return { success: true, message: 'Commande mise à jour avec succès', data: updatedOrder };
  } catch (error) {
    console.error('Erreur dans updateOrderService:', error);
    return { success: false, message: error.message || 'Erreur lors de la mise à jour de la commande' };
  }
};
