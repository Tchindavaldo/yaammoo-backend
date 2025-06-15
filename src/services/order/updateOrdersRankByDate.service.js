const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');

/**
 * Met à jour le rang des commandes en fonction de leur date de création
 * Attribue des rangs en commençant par 1 pour chaque jour différent
 * @param {string} fastFoodId - ID du fastFood
 * @returns {Promise<Object>} - Résultat de la mise à jour
 */
exports.updateOrdersRankByDate = async fastFoodId => {
  try {
    if (!fastFoodId) {
      return { success: false, message: 'fastFoodId est requis' };
    }

    // Récupérer toutes les commandes en pending ou processing
    const snapshot = await db.collection('orders').where('fastFoodId', '==', fastFoodId).where('status', 'in', ['pending', 'processing']).orderBy('createdAt', 'asc').get();

    if (snapshot.empty) {
      return { success: true, message: 'Aucune commande en pending ou processing trouvée', count: 0 };
    }

    const batch = db.batch();
    const updatedOrders = [];
    const ordersByDate = {};

    // Regrouper les commandes par date de création (jour)
    snapshot.forEach(doc => {
      const data = doc.data();

      // Utiliser la date de livraison si disponible, sinon créer une date de livraison par défaut
      if (!data.delivery) {
        data.delivery = {
          status: true,
          type: 'time',
          time: '13:45',
          date: new Date().toISOString().split('T')[0],
        };
      }

      const dateKey = data.delivery.date;

      if (!ordersByDate[dateKey]) {
        ordersByDate[dateKey] = [];
      }

      ordersByDate[dateKey].push({
        id: doc.id,
        data: data,
      });
    });

    // Pour chaque date, attribuer des rangs commençant à 1
    for (const dateKey in ordersByDate) {
      let rank = 1;

      for (const order of ordersByDate[dateKey]) {
        const orderRef = db.collection('orders').doc(order.id);
        const currentData = order.data;
        const currentRank = rank;

        // Mettre à jour le rang et la date de mise à jour
        batch.update(orderRef, {
          rank: currentRank,
          updatedAt: new Date().toISOString(),
          delivery: order.data.delivery,
        });

        // Ajouter la commande mise à jour au tableau des résultats
        updatedOrders.push({
          ...currentData,
          rank: currentRank,
          updatedAt: new Date().toISOString(),
          id: order.id,
        });

        rank++;
      }
    }

    await batch.commit();

    // Émettre les notifications via socket.io
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
