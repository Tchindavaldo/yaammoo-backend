const { db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const sendPushNotification = require('../notification/FCM/sendPushNotification.service');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const FCM_NOTIFY_MAX_QUEUE_SIZE = 20;

const counterDocId = (fastFoodId, deliveryDate, status) =>
  `${fastFoodId}_${deliveryDate}_${status}`;

const counterRef = (fastFoodId, deliveryDate, status) =>
  db.collection('rankCounters').doc(counterDocId(fastFoodId, deliveryDate, status));

/**
 * Assigne un rank atomique à une commande qui entre dans une file (pending ou processing).
 * Utilise un document compteur Firestore pour éviter les races conditions.
 *
 * @param {Object} params
 * @param {string} params.fastFoodId
 * @param {string} params.deliveryDate - format YYYY-MM-DD
 * @param {'pending'|'processing'} params.status - file cible
 * @param {FirebaseFirestore.DocumentReference} params.orderRef - référence à la commande à mettre à jour
 * @param {Object} [params.extraUpdate] - champs additionnels à écrire sur la commande
 * @returns {Promise<number>} le rank attribué
 */
exports.assignRank = async ({ fastFoodId, deliveryDate, status, orderRef, extraUpdate = {} }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);

  return db.runTransaction(async t => {
    const snap = await t.get(cRef);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const newRank = current + 1;
    const now = new Date().toISOString();

    t.set(cRef, { value: newRank, updatedAt: now }, { merge: true });
    t.update(orderRef, { ...extraUpdate, rank: newRank, updatedAt: now });

    return newRank;
  });
};

/**
 * Variante pour la création : le document commande n'existe pas encore, on renvoie
 * juste le rank à écrire dans le payload de création.
 */
exports.reserveRank = async ({ fastFoodId, deliveryDate, status }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);

  return db.runTransaction(async t => {
    const snap = await t.get(cRef);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const newRank = current + 1;
    const now = new Date().toISOString();

    t.set(cRef, { value: newRank, updatedAt: now }, { merge: true });
    return newRank;
  });
};

/**
 * Réindexe une file après qu'une commande (ou plusieurs) en soit sortie.
 * Toutes les commandes avec rank > removedRank décrémentent de 1 (pour chaque rank supprimé inférieur).
 *
 * Emet aussi les events socket userOrderUpdated / ordersRankUpdated et envoie
 * des push FCM aux clients concernés.
 *
 * @param {Object} params
 * @param {string} params.fastFoodId
 * @param {string} params.deliveryDate
 * @param {'pending'|'processing'} params.status
 * @param {number|number[]} params.removedRank
 * @param {string} [params.fastFoodUserId]
 * @returns {Promise<{updatedOrders: Array<{id, userId, rank, status}>}>}
 */
exports.reindexQueue = async ({ fastFoodId, deliveryDate, status, removedRank, fastFoodUserId }) => {
  if (!fastFoodId || !deliveryDate || !status) {
    return { updatedOrders: [] };
  }

  let removedRanks = Array.isArray(removedRank) ? removedRank : [removedRank];
  removedRanks = removedRanks.map(Number).filter(r => !isNaN(r) && r > 0);
  if (removedRanks.length === 0) return { updatedOrders: [] };

  removedRanks.sort((a, b) => a - b);
  const minRank = removedRanks[0];

  console.log('🔁 reindexQueue start', { fastFoodId, deliveryDate, status, removedRanks });

  const ordersRef = db.collection('orders');
  const updatedOrders = [];

  try {
    // Query without orderBy to avoid composite index requirement.
    // We sort client-side after reading the small set.
    const snapshot = await ordersRef
      .where('fastFoodId', '==', fastFoodId)
      .where('status', '==', status)
      .where('delivery.date', '==', deliveryDate)
      .get();

    console.log(`🔁 reindexQueue matched ${snapshot.size} orders in queue '${status}'`);

    if (!snapshot.empty) {
      const batch = db.batch();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const rank = data.rank;
        if (typeof rank !== 'number' || rank <= minRank) return;

        let decrement = 0;
        for (const r of removedRanks) {
          if (r < rank) decrement++;
          else break;
        }
        if (decrement === 0) return;

        const newRank = rank - decrement;
        batch.update(doc.ref, { rank: newRank, updatedAt: new Date().toISOString() });
        updatedOrders.push({
          id: doc.id,
          userId: data.userId,
          rank: newRank,
          status: data.status,
          delivery: data.delivery,
        });
      });

      if (updatedOrders.length > 0) {
        await batch.commit();
        console.log(`🔁 reindexQueue committed ${updatedOrders.length} rank updates`);
      } else {
        console.log('🔁 reindexQueue: no orders needed decrement');
      }
    }
  } catch (e) {
    console.error('❌ reindexQueue query/batch failed:', e.message, e);
  }

  // Décrémenter le compteur de la file (nombre de commandes supprimées)
  try {
    const cRef = counterRef(fastFoodId, deliveryDate, status);
    await db.runTransaction(async t => {
      const snap = await t.get(cRef);
      const current = snap.exists ? snap.data().value || 0 : 0;
      const next = Math.max(0, current - removedRanks.length);
      t.set(cRef, { value: next, updatedAt: new Date().toISOString() }, { merge: true });
    });
  } catch (e) {
    console.error('reindexQueue: counter decrement failed', e.message);
  }

  if (updatedOrders.length === 0) return { updatedOrders };

  // Socket emissions
  try {
    const io = getIO();
    updatedOrders.forEach(order => {
      if (order.userId) {
        io.to(order.userId).emit('userOrderUpdated', { data: order });
      }
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

  // Notifications : uniquement top 5 (et titre spécial pour rank 1)
  if (updatedOrders.length <= FCM_NOTIFY_MAX_QUEUE_SIZE) {
    try {
      const fileLabel = status === 'pending' ? "d'attente" : 'de préparation';
      const topOrders = updatedOrders.filter(o => typeof o.rank === 'number' && o.rank <= 5);
      await Promise.all(
        topOrders.map(order => {
          const isFirst = order.rank === 1;
          return notifyOrderEvent({
            targetUserId: order.userId,
            type: 'order_rank_top',
            title: isFirst ? '🎉 Vous êtes le prochain !' : 'Votre commande avance',
            body: isFirst
              ? 'Votre commande va être traitée.'
              : `Position ${order.rank} dans la file ${fileLabel}.`,
            orderId: order.id,
            route: status === 'pending' ? '/(tabs)/cart?section=pending' : '/(tabs)/cart?section=active',
          });
        })
      );
    } catch (e) {
      console.error('reindexQueue: notification failed', e.message);
    }
  }

  return { updatedOrders };
};

/**
 * Réinitialise le compteur d'une file (après un full re-rank par exemple).
 */
exports.resetCounter = async ({ fastFoodId, deliveryDate, status, value }) => {
  const cRef = counterRef(fastFoodId, deliveryDate, status);
  await cRef.set({ value: value || 0, updatedAt: new Date().toISOString() }, { merge: true });
};
