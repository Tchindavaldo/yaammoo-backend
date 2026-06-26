// ============================================================================
// createOrderService — Façade vers l'orchestrateur
// ============================================================================
// Étapes :
//   1. createWithStockCheck (atomique côté Supabase, séquentiel côté Firestore)
//      → réserve un rank si pending, vérifie/décrémente le stock
//   2. Émet socket 'globalMenuUpdated' si stock modifié
//   3. Crée la transaction associée
//   4. Notifie le marchand si pending
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');

const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { reliableEmit } = require('../../utils/reliableEmit');

exports.createOrderService = async (order) => {
  const result = await repos.orders.createWithStockCheck(order);

  if (result?.error) return { error: result.error };

  const createdOrder = result.order;
  const newStock = result.newStock;

  // Socket temps réel fiable vers le CLIENT : sa commande vient d'être créée
  // (rejoué au reconnect si le client est hors ligne)
  if (createdOrder?.userId) {
    reliableEmit(getIO(), createdOrder.userId, 'newUserOrder', {
      message: 'Commande créée',
      data: createdOrder,
    }).catch((e) => console.warn('[createOrder] reliableEmit newUserOrder:', e.message));
  }

  // Socket : si stock modifié, prévenir tout le monde
  if (typeof newStock === 'number' && order.menu?.id) {
    try {
      const io = getIO();
      const fullMenu = await repos.menus.getById(order.menu.id);
      if (fullMenu) {
        io.emit('globalMenuUpdated', {
          message: 'Stock mis à jour',
          menuId: order.menu.id,
          menu: { ...fullMenu, stock: newStock },
        });
      }
    } catch (e) {
      console.warn('[createOrder] socket emit menu update failed:', e.message);
    }
  }

  // Notification au marchand (si pending uniquement)
  if (order.status === 'pending') {
    try {
      const fastFood = await repos.fastfoods.getById(order.fastFoodId);
      const merchantUserId = fastFood?.userId;
      if (merchantUserId) {
        // Socket temps réel fiable : boutique du marchand se met à jour en live
        // (rejoué au reconnect si le marchand est hors ligne)
        reliableEmit(getIO(), merchantUserId, 'newFastFoodOrders', {
          message: 'Nouvelle commande',
          data: [createdOrder],
        }).catch((e) => console.warn('[createOrder] reliableEmit newFastFoodOrders:', e.message));

        await notifyOrderEvent({
          targetUserId: merchantUserId,
          type: 'order_new',
          title: 'Nouvelle commande',
          body: `${order.menu?.name || 'Menu'} x${order.quantity || 1} — ${order.total} FCFA`,
          orderId: createdOrder.id,
          route: '/(tabs)/boutique',
        });
      }
    } catch (e) {
      console.warn('[createOrder] notify merchant error:', e.message);
    }
  }

  return createdOrder;
};
