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
const { emitBonusStats } = require('../bonus/emitBonusStats');

const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { reliableEmit } = require('../../utils/reliableEmit');
const { validateOrder } = require('../../utils/validator/validateOrder');

exports.createOrderService = async (order) => {
  // Validation au niveau service : garantit qu'aucun chemin d'appel
  // (HTTP POST /order OU flux paiement mwVerdict/postTransaction) ne
  // contourne le validateur.
  const errors = validateOrder(order);
  if (errors && errors.length > 0) return { error: errors };

  const result = await repos.orders.createWithStockCheck(order);

  if (result?.error) return { error: result.error };

  const createdOrder = result.order;
  const newStock = result.newStock;

  // Socket temps réel fiable vers le CLIENT : sa commande vient d'être créée
  // (rejoué au reconnect si le client est hors ligne)
  if (createdOrder?.userId) {
    console.log('[createOrder] socket newUserOrder → userId:', createdOrder.userId, '| userData:', createdOrder.userData, '| selectedPriceIndex:', createdOrder.selectedPriceIndex);
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

  // Bonus : une commande fait monter le solde de TOUS les bonus du user
  // (le brut d'un bonus boutique ne compte que ses commandes, mais le solde
  // plateforme intègre celles de tous les fastfoods). On pousse les soldes
  // recalculés pour que la progression se voie sans re-GET.
  if (createdOrder?.userId) {
    emitBonusStats(createdOrder.userId).catch((e) => console.warn('[createOrder] emitBonusStats:', e.message));
  }

  // Notification au marchand (si pending uniquement)
  if (order.status === 'pending') {
    try {
      const fastFood = await repos.fastfoods.getById(order.fastFoodId);
      const merchantUserId = fastFood?.userId;
      if (merchantUserId) {
        // Socket temps réel fiable : boutique du marchand se met à jour en live
        // (rejoué au reconnect si le marchand est hors ligne)
        console.log('[createOrder] socket newFastFoodOrders → merchantUserId:', merchantUserId, '| userData:', createdOrder.userData, '| selectedPriceIndex:', createdOrder.selectedPriceIndex);
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
