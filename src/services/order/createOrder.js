const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { postTransactionService } = require('../transaction/postTransaction.service');
const { reserveRank } = require('./rankQueue.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

exports.createOrderService = async order => {
  const orderData = { ...order, createdAt: new Date().toISOString() };

  if (order.status === 'pending') {
    const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];
    orderData.rank = await reserveRank({
      fastFoodId: order.fastFoodId,
      deliveryDate,
      status: 'pending',
    });
  }

  const orderRef = await db.collection('orders').add(orderData);

  // Décrémentation du stock — uniquement pour les commandes 'pending'
  if (order.status === 'pending' && order.menu?.id) {
    const menuRef = db.collection('menus').doc(order.menu.id);
    // Re-lire le stock réel en DB pour éviter les race conditions
    const menuDoc = await menuRef.get();
    if (menuDoc.exists) {
      const menuData = menuDoc.data();
      if (typeof menuData.stock === 'number') {
        const qty = Number(order.quantity) || 1;
        if (menuData.stock < qty) {
          // Rollback : supprimer la commande créée
          await db.collection('orders').doc(orderRef.id).delete();
          return { error: `Stock insuffisant. Stock disponible : ${menuData.stock}` };
        }
        const newStock = menuData.stock - qty;
        await menuRef.update({ stock: newStock, updatedAt: new Date().toISOString() });
        // Notifier tous les appareils en temps réel
        const io = getIO();
        const updatedMenu = { id: menuDoc.id, ...menuData, stock: newStock };
        io.emit('globalMenuUpdated', { message: 'Stock mis à jour', menuId: menuDoc.id, menu: updatedMenu });
      }
    }
  }

  const transaction = {
    type: 'order',
    userId: order.userId,
    name: order.menu.name,
    amount: order.total,
    payBy: 'OM',
    currentAmount: 0,
  };

  await postTransactionService(transaction);

  if (order.status === 'pending') {
    try {
      const fastFoodDoc = await db.collection('fastfoods').doc(order.fastFoodId).get();
      const merchantUserId = fastFoodDoc.exists ? fastFoodDoc.data()?.userId : null;
      if (merchantUserId) {
        await notifyOrderEvent({
          targetUserId: merchantUserId,
          type: 'order_new',
          title: 'Nouvelle commande',
          body: `${order.menu?.name || 'Menu'} x${order.quantity || 1} — ${order.total} FCFA`,
          orderId: orderRef.id,
          route: '/(tabs)/boutique',
        });
      }
    } catch (e) {
      console.warn('[createOrder] notify merchant error:', e.message);
    }
  }

  return { id: orderRef.id, ...orderData };
};
