const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');

exports.updateOrdersRank = async (fastFoodId, updatedRanks, date, fastFoodUserId) => {
  try {
    if (!fastFoodId) {
      return { success: false, message: 'fastFoodId est requis' };
    }

    if (!date) {
      return { success: false, message: 'La date est requise' };
    }

    if (!Array.isArray(updatedRanks)) {
      updatedRanks = [updatedRanks];
    }

    updatedRanks = updatedRanks.map(Number).filter(r => !isNaN(r));
    if (updatedRanks.length === 0) {
      return { success: false, message: 'Aucun rang valide fourni' };
    }

    updatedRanks.sort((a, b) => a - b);
    const minRank = updatedRanks[0];

    const ordersRef = db.collection('orders');
    let lastDoc = null;
    let hasMore = true;
    let updatedCount = 0;
    const updatedOrders = [];

    while (hasMore) {
      let query = ordersRef.where('status', 'in', ['pending', 'processing']).where('fastFoodId', '==', fastFoodId).where('delivery.date', '==', date).orderBy('rank').limit(500);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const batch = db.batch();

      snapshot.docs.forEach(doc => {
        const currentData = doc.data();
        const docRef = doc.ref;

        const rank = currentData.rank;
        if (rank > minRank) {
          let decrement = 0;
          for (let r of updatedRanks) {
            if (r < rank) decrement++;
            else break;
          }

          if (decrement > 0) {
            const newRank = rank - decrement;
            batch.update(docRef, {
              rank: newRank,
              updatedAt: new Date().toISOString(),
            });

            updatedCount++;
            updatedOrders.push({
              id: doc.id,
              rank: newRank,
              delivery: currentData.delivery,
            });
          }
        }
      });

      await batch.commit();
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      hasMore = snapshot.size === 500;
    }

    // Notification via socket.io si des commandes ont été mises à jour
    if (updatedCount > 0) {
      const io = getIO();
      
      // Émettre les notifications pour chaque commande mise à jour
      updatedOrders.forEach(order => {
        io.to(order.userId).emit('userOrderUpdated', {
          data: order,
        });
        io.to(fastFoodUserId).emit('fastFoodOrderUpdated', {
          data: order,
        });
      });

      // Émettre un événement global pour le fastFood
      io.to(fastFoodId).emit('ordersRankUpdated', {
        message: `${updatedCount} commandes ont eu leur rang mis à jour pour la date ${date}`,
        orders: updatedOrders,
      });
    }

    return {
      success: true,
      message: `${updatedCount} commandes mises à jour avec succès pour la date ${date}`,
      count: updatedCount,
      data: updatedOrders,
    };
  } catch (error) {
    console.error('Erreur dans updateOrdersRank:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour des rangs',
    };
  }
};
