// ============================================================================
// updateOrdersRankByDate — Façade vers l'orchestrateur
// ============================================================================
// Réindexe complètement les files pending et processing d'un fastFood :
// rangs 1..N par (status, delivery.date) triés par createdAt ASC.
// Réinitialise les compteurs en conséquence.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { resetCounter } = require('./rankQueue.service');

exports.updateOrdersRankByDate = async (fastFoodId) => {
  try {
    if (!fastFoodId) return { success: false, message: 'fastFoodId est requis' };

    const orders = await repos.orders.query({
      fastFoodId,
      status: ['pending', 'processing'],
      orderByCreated: 'asc',
    });

    if (!orders || orders.length === 0) {
      return { success: true, message: 'Aucune commande en pending ou processing trouvée', count: 0 };
    }

    // Groupage par (status, deliveryDate)
    const groups = {};
    orders.forEach((order) => {
      const deliveryDate = order.delivery?.date || new Date().toISOString().split('T')[0];
      // Garantit une structure delivery minimale
      if (!order.delivery) {
        order.delivery = { status: true, type: 'time', time: '13:45', date: deliveryDate };
      }
      const key = `${order.status}__${deliveryDate}`;
      if (!groups[key]) groups[key] = { status: order.status, date: deliveryDate, orders: [] };
      groups[key].orders.push(order);
    });

    const updatedOrders = [];
    for (const key in groups) {
      const { orders: groupOrders } = groups[key];
      let rank = 1;
      for (const order of groupOrders) {
        const updated = await repos.orders.update(order.id, {
          rank,
          delivery: order.delivery,
        });
        updatedOrders.push(updated);
        rank++;
      }
    }

    await Promise.all(
      Object.values(groups).map((g) =>
        resetCounter({
          fastFoodId,
          deliveryDate: g.date,
          status: g.status,
          value: g.orders.length,
        })
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
    return { success: false, message: error.message || 'Erreur lors de la mise à jour des rangs' };
  }
};
