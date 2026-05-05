const { db, admin } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateOrder } = require('../../utils/validator/validateOrder');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { assignRank, reindexQueue } = require('./rankQueue.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const buildTransitionNotif = ({ prevStatus, newStatus, order, merchantUserId }) => {
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
    console.log('🔵 updateOrders called with userId:', userId);

    const removedOrders = [];
    const updates = Array.isArray(orders) ? orders : [orders];
    const groupedByFastFood = {};
    const results = [];
    const transitions = [];

    // Collect reindexing operations to run after all order updates
    // shape: { fastFoodId, deliveryDate, status, removedRank }
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

      const orderRef = db.collection('orders').doc(id);
      const doc = await orderRef.get();

      if (!doc.exists) {
        return { success: false, message: `Commande non trouvée pour l'ID ${id}`, data: null };
      }

      const prevData = doc.data();
      const prevStatus = prevData.status;
      const prevRank = prevData.rank;
      const deliveryDate = prevData.delivery?.date || new Date().toISOString().split('T')[0];

      // Transition autoritaire basée sur le VRAI status courant lu en DB (prevStatus).
      // Le backend ignore la valeur de status envoyée par le client pour les transitions
      // linéaires — seuls les cancels explicites passent tels quels.
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

      console.log(`🟡 order ${id} transition: ${prevStatus} (rank ${prevRank}) → ${newStatus}`);

      // Ranks handling
      // 1) Order leaving a ranked queue → schedule reindex + clear rank
      if (isRankedStatus(prevStatus) && prevStatus !== newStatus && typeof prevRank === 'number') {
        console.log(`📌 scheduling reindex of '${prevStatus}' queue at rank ${prevRank} (date ${deliveryDate})`);
        reindexOps.push({
          fastFoodId,
          deliveryDate,
          status: prevStatus,
          removedRank: prevRank,
        });
        setData.rank = admin.firestore.FieldValue.delete();
      } else {
        console.log(`⏭️ no reindex scheduled (prevRanked=${isRankedStatus(prevStatus)}, statusChanged=${prevStatus !== newStatus}, rankType=${typeof prevRank})`);
      }

      // 2) Cleanup delivery tracking fields on finished
      if (newStatus === 'finished') {
        if (prevData.hasOwnProperty('clientId')) setData.clientId = admin.firestore.FieldValue.delete();
        if (prevData.hasOwnProperty('periodKey')) setData.periodKey = admin.firestore.FieldValue.delete();
        if (prevData.hasOwnProperty('clientId') || prevData.hasOwnProperty('periodKey')) {
          removedOrders.push({
            orderId: id,
            clientId: prevData.clientId || null,
            periodKey: prevData.periodKey || null,
          });
        }
      }

      // 2b) Stock decrement — uniquement sur la transition pendingToBuy → pending
      if (prevStatus === 'pendingToBuy' && newStatus === 'pending') {
        const menuId = prevData.menu?.id;
        const qty = Number(updateData.quantity ?? prevData.quantity) || 1;
        if (menuId) {
          const menuRef = db.collection('menus').doc(menuId);
          const menuDoc = await menuRef.get();
          if (menuDoc.exists) {
            const menuData = menuDoc.data();
            if (typeof menuData.stock === 'number') {
              if (menuData.stock < qty) {
                return {
                  success: false,
                  message: `Stock insuffisant pour "${menuData.name || menuData.titre || 'ce menu'}". Stock disponible : ${menuData.stock}`,
                  data: null,
                };
              }
              const newStock = menuData.stock - qty;
              await menuRef.update({ stock: newStock, updatedAt: new Date().toISOString() });
              const updatedMenu = { id: menuDoc.id, ...menuData, stock: newStock };
              io.emit('globalMenuUpdated', { message: 'Stock mis à jour', menuId: menuDoc.id, menu: updatedMenu });
            }
          }
        }
      }

      // 3) Order entering a ranked queue → assign new rank atomically via counter
      //    We persist setData first (without rank), then call assignRank which
      //    also updates the doc with the rank + updatedAt.
      if (isRankedStatus(newStatus)) {
        // Make sure any "rank" field inside updateData does not leak: assignRank sets it
        delete setData.rank;
        await orderRef.update(setData);
        await assignRank({
          fastFoodId,
          deliveryDate,
          status: newStatus,
          orderRef,
        });
      } else {
        await orderRef.update(setData);
      }

      const updatedDoc = await orderRef.get();
      const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };
      results.push(updatedOrder);

      if (prevStatus !== newStatus) {
        transitions.push({ prevStatus, newStatus, order: updatedOrder, fastFoodId });
      }

      if (!groupedByFastFood[fastFoodId]) groupedByFastFood[fastFoodId] = [];
      groupedByFastFood[fastFoodId].push(updatedOrder);
    }

    let message = updates.some(o => o.status === 'cancelByFastFood')
      ? 'Commande annulée avec succès'
      : updates.some(o => o.status === 'cancelByUser')
        ? 'Commande retirée du panier avec succès'
        : 'Commande(s) mise(s) à jour avec succès';

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
          io.to(fastfood.userId).emit('newFastFoodOrders', {
            message: pendingOrders.length > 1 ? 'Nouvelles commandes' : 'Nouvelle commande',
            data: pendingOrders,
          });
          pendingOrders.forEach(order => {
            io.to(order.userId).emit('userOrderUpdated', { data: order });
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
            io.to(order.userId).emit('userOrderUpdated', { data: order });
            io.to(fastfood.userId).emit('fastFoodOrderUpdated', { data: order });
          }
        });

        // Dispatch transition notifications for this fastFood
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

        // Execute scheduled reindex operations for this fastFood
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
