const { db, admin } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateOrders = async (orders, userId) => {
  try {
    const io = getIO();

    // Initialize array to store clientId and periodKey for removal notifications
    const removedOrders = [];
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
          data: null,
        };
      }

      const { id, status, fastFoodId } = updateData;

      if (!id) {
        return {
          success: false,
          message: 'ID de commande manquant pour une mise à jour.',
          data: null,
        };
      }
      if (!userId) {
        return {
          success: false,
          message: 'userId manquant pour une mise à jour.',
          data: null,
        };
      }

      if (!fastFoodId) {
        return {
          success: false,
          message: 'fastFoodId manquant pour une mise à jour.',
          data: null,
        };
      }

      const orderRef = db.collection('orders').doc(id);
      const doc = await orderRef.get();

      if (!doc.exists) {
        return {
          success: false,
          message: `Commande non trouvée pour l'ID ${id}`,
          data: null,
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
        case 'finished':
          newStatus = 'delivering';
          break;
        case 'delivering':
          newStatus = 'delivered';
          break;
        // 'finished' reste 'finished'
        default:
          newStatus = status;
      }

      // Prepare update data
      const setData = {
        ...updateData,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };

      // Only delete clientId and periodKey if they exist and status is 'finished'
      if (newStatus === 'finished') {
        if (doc.data().hasOwnProperty('clientId')) {
          setData.clientId = admin.firestore.FieldValue.delete();
          // console.log('Deleted clientId for order ID:', id);
        }
        if (doc.data().hasOwnProperty('periodKey')) {
          setData.periodKey = admin.firestore.FieldValue.delete();
          // console.log('Deleted periodKey for order ID:', id);
        }
        // Store the values for notification only if at least one field is being deleted
        if (doc.data().hasOwnProperty('clientId') || doc.data().hasOwnProperty('periodKey')) {
          removedOrders.push({
            orderId: id,
            clientId: doc.data().clientId || null,
            periodKey: doc.data().periodKey || null,
          });
        }
      }

      // Update the order
      await orderRef.update(setData);

      const updatedDoc = await orderRef.get();
      // console.log('Updated order data:', updatedDoc.data());
      const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };
      results.push(updatedOrder);

      // Regrouper par fastFoodId
      if (!groupedByFastFood[fastFoodId]) {
        groupedByFastFood[fastFoodId] = [];
      }
      groupedByFastFood[fastFoodId].push(updatedOrder);
    }

    // console.log('groupedByFastFood', groupedByFastFood);

    let message = updates.some(order => order.status === 'cancelByFastFood')
      ? 'Commande annulée avec succès'
      : updates.some(order => order.status === 'cancelByUser')
        ? 'Commande retirée du panier avec succès'
        : 'Commande(s) mise(s) à jour avec succès';
    let hasRemoval = false;
    let hasNewDelivery = false;

    for (const fastFoodId in groupedByFastFood) {
      try {
        const fastfood = await getFastFoodService(fastFoodId);
        if (!fastfood.userId) {
          // console.warn(`userId manquant pour le fastfood ${fastFoodId}`);
          continue;
        }

        // Parcourir chaque commande du fastfood
        let shouldUpdatePeriodKey = false;
        let shouldUpdateClientId = false;
        let currentOrderId = null;
        groupedByFastFood[fastFoodId].forEach(order => {
          currentOrderId = order.id;
          if (order.status === 'pending') {
            io.to(fastfood.userId).emit('newFastFoodOrders', {
              message: 'Nouvelle commande',
              data: order,
            });
            io.to(order.userId).emit('userOrderUpdated', {
              data: order,
            });
          }

          if (fastfood.userId === userId && order.periodKey !== undefined && order.status === 'delivering') {
            // console.log('periode emission emit', 'userid', order.userId, 'fastfoodid', fastfood.userId, order.periodKey);
            io.to(order.userId).emit('newPeriodKeyDelivering', {
              periodKey: order.periodKey,
            });
            io.to(fastfood.userId).emit('newPeriodKeyDelivering', {
              periodKey: order.periodKey,
            });
            hasNewDelivery = true;
          }

          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            // console.log('periode emission removal', 'userid', order.userId, 'fastfoodid', fastfood.userId, order.periodKey);
            const removedOrder = removedOrders.find(removed => removed.orderId === order.id);
            if (removedOrder && removedOrder.periodKey) {
              io.to(order.userId).emit('removePeriodKeyDelivering', {
                periodKey: removedOrder.periodKey,
              });
              io.to(fastfood.userId).emit('removePeriodKeyDelivering', {
                periodKey: removedOrder.periodKey,
              });
              shouldUpdatePeriodKey = true;
              hasRemoval = true;
            }
          }

          if (fastfood.userId === userId && order.clientId !== undefined && order.status === 'delivering') {
            // console.log('time emission emit', 'userid', order.userId, 'fastfoodid', fastfood.userId, order.periodKey);
            io.to(order.userId).emit('newClientIdDelivering', {
              clientId: order.clientId,
            });
            io.to(fastfood.userId).emit('newClientIdDelivering', {
              clientId: order.clientId,
            });
            hasNewDelivery = true;
          }

          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            // console.log('time emission removal', 'userid', order.userId, 'fastfoodid', fastfood.userId, order.periodKey);
            const removedOrder = removedOrders.find(removed => removed.orderId === order.id);
            if (removedOrder && removedOrder.clientId) {
              io.to(order.userId).emit('removeClientIdDelivering', {
                clientId: removedOrder.clientId,
              });
              io.to(fastfood.userId).emit('removeClientIdDelivering', {
                clientId: removedOrder.clientId,
              });
              shouldUpdateClientId = true;
              hasRemoval = true;
            }
          }

          if (fastfood.userId === userId) {
            if (!shouldUpdatePeriodKey && !shouldUpdateClientId) {
              io.to(order.userId).emit('userOrderUpdated', {
                data: order,
              });
              io.to(fastfood.userId).emit('fastFoodOrderUpdated', {
                data: order,
              });
            }
          }
        });
      } catch (err) {
        console.error(`Erreur lors de l'émission pour fastFoodId ${fastFoodId}:`, err.message);
        continue;
      }
    }

    // Set message based on the type of update
    if (results.some(order => order.status === 'finished') && hasRemoval) {
      message = 'Livraison annulée avec succès';
    } else if (hasNewDelivery) {
      message = 'Nouvelle livraison lancée avec succès';
    }

    return {
      success: true,
      message: message,
      data: results,
    };
  } catch (error) {
    // console.error('Erreur dans updateOrders:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des commandes',
      data: null,
    };
  }
};
