const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { resetCounter } = require('./rankQueue.service');

/**
 * Réindexe complètement les files pending et processing d'un fastFood,
 * en attribuant des rangs 1..N par (status, delivery.date), triés par createdAt ASC.
 * Réinitialise les compteurs atomiques en conséquence.
 */
exports.updateOrdersRankByDate = async fastFoodId => {
  try {
    if (!fastFoodId) return { success: false, message: 'fastFoodId est requis' };

    const snapshot = await db
      .collection('orders')
      .where('fastFoodId', '==', fastFoodId)
      .where('status', 'in', ['pending', 'processing'])
      .orderBy('createdAt', 'asc')
      .get();

    if (snapshot.empty) {
      return { success: true, message: 'Aucune commande en pending ou processing trouvée', count: 0 };
    }

    const batch = db.batch();
    const updatedOrders = [];
    // Group by (status, date) → separate queues
    const groups = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.delivery) {
        data.delivery = {
          status: true,
          type: 'time',
          time: '13:45',
          date: new Date().toISOString().split('T')[0],
        };
      }
      const key = `${data.status}__${data.delivery.date}`;
      if (!groups[key]) groups[key] = { status: data.status, date: data.delivery.date, orders: [] };
      groups[key].orders.push({ id: doc.id, data });
    });

    for (const key in groups) {
      const { orders } = groups[key];
      let rank = 1;
      for (const order of orders) {
        const orderRef = db.collection('orders').doc(order.id);
        batch.update(orderRef, {
          rank,
          updatedAt: new Date().toISOString(),
          delivery: order.data.delivery,
        });
        updatedOrders.push({ ...order.data, rank, updatedAt: new Date().toISOString(), id: order.id });
        rank++;
      }
    }

    await batch.commit();

    // Reset counters to the new max rank for each (status, date)
    await Promise.all(
      Object.values(groups).map(g =>
        resetCounter({ fastFoodId, deliveryDate: g.date, status: g.status, value: g.orders.length })
      )
    );

    const io = getIO();
    io.to(fastFoodId).emit('ordersRankUpdated', {
      message: `${updatedOrders.length} commandes ont eu leur rang mis à jour`,
      orders: updatedOrders,
    });

    return {
      success: true,
      message: `${updatedOrders.length} commandes mises à jour avec succès`,
      count: updatedOrders.length,
      data: updatedOrders,
    };
  } catch (error) {
    console.error('Erreur dans updateOrdersRankByDate:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des rangs',
    };
  }
};
