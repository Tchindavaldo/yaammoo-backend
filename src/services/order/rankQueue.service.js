// ============================================================================
// rankQueue.service — Façade vers l'orchestrateur + logique métier non-DB
// ============================================================================
// Les opérations purement DB (reserveRank, assignRank, reindexQueue, resetCounter)
// passent par repos.orders qui gère le dual-write.
// La logique métier (socket emit, notifications push aux top 5) reste ici.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const FCM_NOTIFY_MAX_QUEUE_SIZE = 20;

exports.assignRank = async ({ fastFoodId, deliveryDate, status, orderRef, extraUpdate = {} }) => {
  const orderId = orderRef?.id || orderRef;
  // Si extraUpdate est non vide, on l'écrit d'abord
  if (extraUpdate && Object.keys(extraUpdate).length > 0) {
    await repos.orders.update(orderId, extraUpdate);
  }
  return repos.orders.assignRank({ orderId, fastFoodId, deliveryDate, status });
};

exports.reserveRank = async ({ fastFoodId, deliveryDate, status }) => {
  return repos.orders.reserveRank({ fastFoodId, deliveryDate, status });
};

exports.reindexQueue = async ({ fastFoodId, deliveryDate, status, removedRank, fastFoodUserId }) => {
  if (!fastFoodId || !deliveryDate || !status) {
    return { updatedOrders: [] };
  }

  let removedRanks = Array.isArray(removedRank) ? removedRank : [removedRank];
  removedRanks = removedRanks.map(Number).filter((r) => !isNaN(r) && r > 0);
  if (removedRanks.length === 0) return { updatedOrders: [] };

  let updatedOrders = [];
  try {
    updatedOrders = await repos.orders.reindexQueue({
      fastFoodId,
      deliveryDate,
      status,
      removedRanks,
    });
  } catch (e) {
    console.error('reindexQueue failed:', e.message);
    return { updatedOrders: [] };
  }

  if (!updatedOrders || updatedOrders.length === 0) return { updatedOrders };

  // Socket emissions
  try {
    const io = getIO();
    updatedOrders.forEach((order) => {
      if (order.userId) io.to(order.userId).emit('userOrderUpdated', { data: order });
    });
    if (fastFoodUserId) {
      io.to(fastFoodUserId).emit('ordersRankUpdated', {
        message: `${updatedOrders.length} commandes mises à jour`,
        file: status,
        orders: updatedOrders,
      });
      io.to(fastFoodUserId).emit('fastFoodOrderUpdated', { data: updatedOrders });
    }
  } catch (e) {
    console.error('reindexQueue: socket emit failed', e.message);
  }

  // Notification push : uniquement aux clients qui passent en tête de file (rank=1).
  // Les autres changements de rank ne déclenchent pas de notification — éviter le spam.
  try {
    const firstOrders = updatedOrders.filter((o) => o.rank === 1);
    await Promise.all(
      firstOrders.map((order) =>
        notifyOrderEvent({
          targetUserId: order.userId,
          type: 'order_rank_top',
          title: '🎉 Vous êtes le prochain !',
          body: 'Votre commande va être traitée.',
          orderId: order.id,
          route: status === 'pending' ? '/(tabs)/cart?section=pending' : '/(tabs)/cart?section=active',
        })
      )
    );
  } catch (e) {
    console.error('reindexQueue: notification failed', e.message);
  }

  return { updatedOrders };
};

exports.resetCounter = async ({ fastFoodId, deliveryDate, status, value }) => {
  return repos.orders.resetCounter({ fastFoodId, deliveryDate, status, value });
};
