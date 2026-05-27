// ============================================================================
// updateOrdersFieldService — Façade vers l'orchestrateur
// ============================================================================
// Met à jour un champ spécifique pour toutes les commandes d'un fastFood ou
// d'un user, avec un filtrage optionnel par status.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateOrdersFieldService = async (params) => {
  const { fastFoodId, userId, fieldName, fieldValue, filterStatus } = params;

  if (!fieldName) return { success: false, message: 'Le nom du champ à mettre à jour est requis' };
  if (fieldValue === undefined) return { success: false, message: 'La valeur du champ à mettre à jour est requise' };
  if (!fastFoodId && !userId) return { success: false, message: 'Vous devez fournir soit un fastFoodId, soit un userId' };

  try {
    const orders = await repos.orders.query({
      fastFoodId,
      userId,
      status: filterStatus,
      orderByCreated: null,
    });

    if (!orders || orders.length === 0) {
      return { success: true, message: 'Aucune commande trouvée correspondant aux critères', count: 0 };
    }

    // Validation
    const validationData = { [fieldName]: fieldValue };
    const errors = validateOrder(validationData, false, true);
    if (errors) return { success: false, message: `Erreur de validation: ${errors}` };

    // Mise à jour séquentielle (compatible dual-write)
    const updatedOrders = [];
    for (const order of orders) {
      let updateValue = fieldValue;
      // Si objet : merger avec l'existant
      if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
        const current = order[fieldName] || {};
        updateValue = { ...current, ...fieldValue };
      }
      const updated = await repos.orders.update(order.id, { [fieldName]: updateValue });
      updatedOrders.push(updated);
    }

    // Notifications socket
    const io = getIO();
    const groupedByFastFood = {};
    const groupedByUser = {};
    updatedOrders.forEach((order) => {
      if (!groupedByFastFood[order.fastFoodId]) groupedByFastFood[order.fastFoodId] = [];
      groupedByFastFood[order.fastFoodId].push(order);
      if (!groupedByUser[order.userId]) groupedByUser[order.userId] = [];
      groupedByUser[order.userId].push(order);
    });

    for (const ffId in groupedByFastFood) {
      try {
        const fastFood = await getFastFoodService(ffId);
        if (fastFood?.userId) {
          io.to(fastFood.userId).emit('fastFoodOrdersUpdated', {
            message: `Mise à jour du champ ${fieldName} pour ${groupedByFastFood[ffId].length} commandes`,
            field: fieldName,
            orders: groupedByFastFood[ffId],
          });
        }
      } catch (_) { /* ignore */ }
    }

    for (const uid in groupedByUser) {
      io.to(uid).emit('userOrdersUpdated', {
        message: `Mise à jour du champ ${fieldName} pour ${groupedByUser[uid].length} commandes`,
        field: fieldName,
        orders: groupedByUser[uid],
      });
    }

    return {
      success: true,
      message: `${updatedOrders.length} commandes mises à jour avec succès`,
      count: updatedOrders.length,
      data: updatedOrders,
    };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la mise à jour des commandes' };
  }
};
