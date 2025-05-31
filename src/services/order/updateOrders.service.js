const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateOrders = async (orders, userId) => {
  try {
    const io = getIO();

    // Force orders à être un tableau
    const updates = Array.isArray(orders) ? orders : [orders];
    const groupedByFastFood = {};
    const results = [];

    for (const updateData of updates) {
      const errors = validateOrder(updateData, false, true);
      if (errors.length > 0) {
        const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
        return {
          success: false,
          message: `Erreur de validation pour la commande ${updateData.id || 'inconnue'}: ${formattedErrors}`,
          data: null
        };
      }

      const { id, status, fastFoodId } = updateData;

      if (!id) {
        return {
          success: false,
          message: 'ID de commande manquant pour une mise à jour.',
          data: null
        };
      }
      if (!userId) {
        return {
          success: false,
          message: 'userId manquant pour une mise à jour.',
          data: null
        };
      }

      if (!fastFoodId) {
        return {
          success: false,
          message: 'fastFoodId manquant pour une mise à jour.',
          data: null
        };
      }

      const orderRef = db.collection('orders').doc(id);
      const doc = await orderRef.get();

      if (!doc.exists) {
        return {
          success: false,
          message: `Commande non trouvée pour l'ID ${id}`,
          data: null
        };
      }

    // Définition de la logique de transition des statuts
    let newStatus = status;

    switch (status) {
      case 'pendingToBuy':
        newStatus = 'pending';
        break;
      case 'pending':
        newStatus = 'processing';
        break;
      case 'processing':
        newStatus = 'finished';
        break;
      // 'finished' reste 'finished'
      default:
        newStatus = status;
    }

    await orderRef.update({
      ...updateData,
      status: newStatus,
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

  // console.log('groupedByFastFood', groupedByFastFood);

  for (const fastFoodId in groupedByFastFood) {
    try {
      const fastfood = await getFastFoodService(fastFoodId);
      if (!fastfood.userId) {
        // console.warn(`userId manquant pour le fastfood ${fastFoodId}`);
        continue;
      }

      // Parcourir chaque commande du fastfood
      groupedByFastFood[fastFoodId].forEach(order => {
        if (order.status === 'pending') {
          io.to(fastfood.userId).emit('newFastFoodOrders', {
            message: 'Nouvelle commande',
            data: order,
          });
        }

        if (fastfood.userId === userId) {
          io.to(order.userId).emit('userOrderUpdated', {
            data: order,
          });
          io.to(fastfood.userId).emit('fastFoodOrderUpdated', {
            data: order,
          });
        }
      });
    } catch (err) {
      // console.warn(`Erreur lors de l'émission pour fastFoodId ${fastFoodId}: ${err.message}`);
      continue;
    }
  }

  // Si un seul élément, retourner l'objet avec success, message et data
  const data = results.length === 1 ? results[0] : results;
  return {
    success: true,
    message: 'Commande(s) mise(s) à jour avec succès',
    data
  };
  } catch (error) {
    // console.error('Erreur dans updateOrders:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des commandes',
      data: null
    };
  }
};
