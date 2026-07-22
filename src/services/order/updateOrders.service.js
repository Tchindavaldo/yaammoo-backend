// ============================================================================
// updateOrders.service — Façade vers l'orchestrateur
// ============================================================================
// State machine des commandes :
//   pendingToBuy → pending → processing → finished → delivering → delivered
//   (+ cancelByUser, cancelByFastFood comme transitions explicites)
//
// Logique conservée à l'identique :
//   - Transitions autoritaires basées sur le status DB (pas celui du client)
//   - Stock décrémenté à pendingToBuy → pending
//   - Rank assigné quand entrée en file (pending/processing)
//   - Rank/clientId/periodKey supprimés en sortie de file ou à 'finished'
//   - Reindex queue après chaque sortie de file
//   - Emissions socket + notifications push pour les transitions
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { assignRank, reindexQueue } = require('./rankQueue.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { reliableEmit } = require('../../utils/reliableEmit');
const { settleDeliveryService } = require('./settleDelivery.service');
const { generateId } = require('../../repositories/idGen');

const buildTransitionNotif =({ prevStatus, newStatus, order, merchantUserId }) => {
  const menuName = order.menu?.name || order.menu?.titre || 'Menu';
  const qty = order.quantity || 1;
  const total = order.total || 0;
  const bodyBase = `${menuName} x${qty} — ${total} FCFA`;

  if (prevStatus === 'pendingToBuy' && newStatus === 'pending' && merchantUserId) {
    return { targetUserId: merchantUserId, type: 'order_new', title: 'Nouvelle commande', body: bodyBase, orderId: order.id, route: '/(tabs)/boutique' };
  }
  if (prevStatus === 'pending' && newStatus === 'processing') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Commande acceptée', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=active' };
  }
  if (prevStatus === 'processing' && newStatus === 'finished') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Commande prête', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (prevStatus === 'finished' && newStatus === 'delivering') {
    return { targetUserId: order.userId, type: 'order_delivering', title: 'En livraison', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (prevStatus === 'delivering' && newStatus === 'delivered') {
    return { targetUserId: order.userId, type: 'order_status', title: 'Livrée', body: bodyBase, orderId: order.id, route: '/(tabs)/cart?section=finished' };
  }
  if (newStatus === 'cancelByUser' && merchantUserId) {
    return { targetUserId: merchantUserId, type: 'order_cancel_by_user', title: 'Commande annulée par le client', body: bodyBase, orderId: order.id, route: '/(tabs)/notifications' };
  }
  if (newStatus === 'cancelByFastFood') {
    return { targetUserId: order.userId, type: 'order_cancel_by_merchant', title: 'Commande annulée par le resto', body: bodyBase, orderId: order.id, route: '/(tabs)/notifications' };
  }
  return null;
};

const isRankedStatus = s => s === 'pending' || s === 'processing';
const isCancelStatus = s => s === 'cancelByUser' || s === 'cancelByFastFood';

exports.updateOrders = async (orders, userId) => {
  try {
    const io = getIO();

    const removedOrders = [];
    const updates = Array.isArray(orders) ? orders : [orders];
    const groupedByFastFood = {};
    const results = [];
    const transitions = [];
    const reindexOps = [];

    for (const updateData of updates) {
      const errors = validateOrder(updateData, false, false);
      if (errors && errors.length > 0) {
        const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
        return {
          success: false,
          message: `Erreur de validation pour la commande ${updateData.id || 'inconnue'}: ${formattedErrors}`,
          data: null,
        };
      }

      const { id, status, fastFoodId } = updateData;
      if (!id) return { success: false, message: 'ID de commande manquant pour une mise à jour.', data: null };
      if (!userId) return { success: false, message: 'userId manquant pour une mise à jour.', data: null };
      if (!fastFoodId) return { success: false, message: 'fastFoodId manquant pour une mise à jour.', data: null };

      const prevData = await repos.orders.getById(id);
      if (!prevData) return { success: false, message: `Commande non trouvée pour l'ID ${id}`, data: null };

      const prevStatus = prevData.status;
      const prevRank = prevData.rank;
      const deliveryDate = prevData.delivery?.date || new Date().toISOString().split('T')[0];

      // Transition autoritaire (état réel en DB)
      let newStatus;
      if (isCancelStatus(status)) {
        newStatus = status;
      } else {
        switch (prevStatus) {
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
          default:
            newStatus = prevStatus;
        }
      }

      const setData = {
        ...updateData,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      const fieldsToDelete = [];

      // 1) Sortie de file : reindex à scheduler + clear rank
      if (isRankedStatus(prevStatus) && prevStatus !== newStatus && typeof prevRank === 'number') {
        reindexOps.push({ fastFoodId, deliveryDate, status: prevStatus, removedRank: prevRank });
        fieldsToDelete.push('rank');
      }

      // 2) Cleanup tracking fields sur 'finished'
      if (newStatus === 'finished') {
        if (Object.prototype.hasOwnProperty.call(prevData, 'clientId')) fieldsToDelete.push('clientId');
        if (Object.prototype.hasOwnProperty.call(prevData, 'periodKey')) fieldsToDelete.push('periodKey');
        if (prevData.clientId || prevData.periodKey) {
          removedOrders.push({
            orderId: id,
            clientId: prevData.clientId || null,
            periodKey: prevData.periodKey || null,
          });
        }
      }

      // 2b) Stock check à pendingToBuy → pending
      if (prevStatus === 'pendingToBuy' && newStatus === 'pending') {
        const menuId = prevData.menu?.id;
        const qty = Number(updateData.quantity ?? prevData.quantity) || 1;
        if (menuId) {
          const menu = await repos.menus.getById(menuId);
          if (menu && typeof menu.stock === 'number') {
            if (menu.stock < qty) {
              return {
                success: false,
                message: `Stock insuffisant pour "${menu.name || menu.titre || 'ce menu'}". Stock disponible : ${menu.stock}`,
                data: null,
              };
            }
            const newStock = menu.stock - qty;
            const updatedMenu = await repos.menus.updateStock(menuId, newStock);
            io.emit('globalMenuUpdated', { message: 'Stock mis à jour', menuId, menu: updatedMenu });
          }
        }
      }

      // 3) Entrée dans une file rangée : assigner rank atomiquement
      if (isRankedStatus(newStatus)) {
        // rank sera assigné par assignRank, on ne le met pas dans setData
        delete setData.rank;
        if (fieldsToDelete.length > 0) setData.__delete = fieldsToDelete;
        await repos.orders.update(id, setData);
        await assignRank({ fastFoodId, deliveryDate, status: newStatus, orderRef: id });
      } else {
        if (fieldsToDelete.length > 0) setData.__delete = fieldsToDelete;
        await repos.orders.update(id, setData);
      }

      const updatedOrder = await repos.orders.getById(id);
      results.push(updatedOrder);

      if (prevStatus !== newStatus) {
        transitions.push({ prevStatus, newStatus, order: updatedOrder, fastFoodId });
      }

      if (!groupedByFastFood[fastFoodId]) groupedByFastFood[fastFoodId] = [];
      groupedByFastFood[fastFoodId].push(updatedOrder);
    }

    // ── Règlement livraison : le panier vient d'être payé ────────────────────
    // `updates` est le panier ENTIER, reçu en un seul appel. C'est le seul
    // moment où le backend voit ces commandes comme un tout — donc le seul où il
    // peut ne compter qu'UNE course par boutique et ne consommer le bonus
    // qu'une fois. Déclenché sur la transition vers `pending` uniquement : avant,
    // le panier peut encore être vidé.
    const becamePending = transitions.filter(t => t.prevStatus === 'pendingToBuy' && t.newStatus === 'pending').map(t => t.order);

    if (becamePending.length > 0) {
      // Panier de plusieurs plats : un `groupId` commun permet de les réafficher
      // ensemble côté marchand comme côté client — un seul client, une seule
      // livraison, même si ce sont techniquement plusieurs commandes.
      // Inutile sur une commande seule : on ne pollue pas la donnée.
      if (becamePending.length > 1) {
        const groupId = generateId();
        for (const order of becamePending) {
          try {
            await repos.orders.update(order.id, { groupId });
            order.groupId = groupId;
          } catch (e) {
            console.warn(`[updateOrders] groupId non appliqué à ${order.id}:`, e.message);
          }
        }
      }

      // Le code bonus voyage avec le panier, pas avec un plat en particulier.
      const bonusCode = updates.find(o => o && o.bonusCode)?.bonusCode;
      const settled = await settleDeliveryService({ orders: becamePending, bonusCode });
      // Le front reçoit l'offre appliquée sans avoir à re-GET.
      if (settled.offer) {
        for (const order of becamePending) order.deliveryOffer = settled.offer;
      }
    }

    let message = updates.some(o => o.status === 'cancelByFastFood') ? 'Commande annulée avec succès' : updates.some(o => o.status === 'cancelByUser') ? 'Commande retirée du panier avec succès' : 'Commande(s) mise(s) à jour avec succès';

    let hasRemoval = false;
    let hasNewDelivery = false;

    for (const fastFoodId in groupedByFastFood) {
      try {
        const fastfood = await getFastFoodService(fastFoodId);
        if (!fastfood.userId) continue;

        const pendingOrders = [];
        groupedByFastFood[fastFoodId].forEach(order => {
          if (order.status === 'pending') pendingOrders.push(order);
        });

        if (pendingOrders.length > 0) {
          reliableEmit(io, fastfood.userId, 'newFastFoodOrders', {
            message: pendingOrders.length > 1 ? 'Nouvelles commandes' : 'Nouvelle commande',
            data: pendingOrders,
          }).catch(e => console.warn('[updateOrders] reliableEmit newFastFoodOrders:', e.message));
          pendingOrders.forEach(order => {
            reliableEmit(io, order.userId, 'userOrderUpdated', { data: order }).catch(e => console.warn('[updateOrders] reliableEmit userOrderUpdated:', e.message));
          });
        }

        groupedByFastFood[fastFoodId].forEach(order => {
          if (fastfood.userId === userId && order.periodKey !== undefined && order.status === 'delivering') {
            io.to(order.userId).emit('newPeriodKeyDelivering', { periodKey: order.periodKey });
            io.to(fastfood.userId).emit('newPeriodKeyDelivering', { periodKey: order.periodKey });
            hasNewDelivery = true;
          }
          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            const r = removedOrders.find(x => x.orderId === order.id);
            if (r && r.periodKey) {
              io.to(order.userId).emit('removePeriodKeyDelivering', { periodKey: r.periodKey });
              io.to(fastfood.userId).emit('removePeriodKeyDelivering', { periodKey: r.periodKey });
              hasRemoval = true;
            }
          }
          if (fastfood.userId === userId && order.clientId !== undefined && order.status === 'delivering') {
            io.to(order.userId).emit('newClientIdDelivering', { clientId: order.clientId });
            io.to(fastfood.userId).emit('newClientIdDelivering', { clientId: order.clientId });
            hasNewDelivery = true;
          }
          if (fastfood.userId === userId && removedOrders.length > 0 && order.status === 'finished') {
            const r = removedOrders.find(x => x.orderId === order.id);
            if (r && r.clientId) {
              io.to(order.userId).emit('removeClientIdDelivering', { clientId: r.clientId });
              io.to(fastfood.userId).emit('removeClientIdDelivering', { clientId: r.clientId });
              hasRemoval = true;
            }
          }
          if (order.status !== 'pending') {
            reliableEmit(io, order.userId, 'userOrderUpdated', { data: order }).catch(e => console.warn('[updateOrders] reliableEmit userOrderUpdated:', e.message));
            reliableEmit(io, fastfood.userId, 'fastFoodOrderUpdated', { data: order }).catch(e => console.warn('[updateOrders] reliableEmit fastFoodOrderUpdated:', e.message));
          }
        });

        // Notifications de transitions
        const ffTransitions = transitions.filter(t => t.fastFoodId === fastFoodId);
        for (const t of ffTransitions) {
          const notif = buildTransitionNotif({
            prevStatus: t.prevStatus,
            newStatus: t.newStatus,
            order: t.order,
            merchantUserId: fastfood.userId,
          });
          if (notif) {
            notifyOrderEvent(notif).catch(e => console.warn('[updateOrders] notify error:', e.message));
          }
        }

        // Reindex queue scheduled ops
        const opsForFF = reindexOps.filter(op => op.fastFoodId === fastFoodId);
        for (const op of opsForFF) {
          await reindexQueue({
            fastFoodId: op.fastFoodId,
            deliveryDate: op.deliveryDate,
            status: op.status,
            removedRank: op.removedRank,
            fastFoodUserId: fastfood.userId,
          });
        }
      } catch (err) {
        console.error(`Erreur lors de l'émission pour fastFoodId ${fastFoodId}:`, err.message);
        continue;
      }
    }

    if (results.some(o => o.status === 'finished') && hasRemoval) {
      message = 'Livraison annulée avec succès';
    } else if (hasNewDelivery) {
      message = 'Nouvelle livraison lancée avec succès';
    }

    return { success: true, message, data: results };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des commandes',
      data: null,
    };
  }
};
