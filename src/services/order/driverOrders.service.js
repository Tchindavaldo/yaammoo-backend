// ============================================================================
// driverOrders.service — Délégation d'une commande à un livreur (driver)
// ============================================================================
// Flux :
//   1. Le fastFood ASSIGNE une commande à un livreur → assignDriver()
//      (pose order.driverId) → event `driverOrderAssigned` (→ room uid du livreur).
//   2. Le livreur fait progresser la commande → driverUpdateStatus()
//      statuts autorisés : 'delivering', 'finished'. On VÉRIFIE que la commande
//      est bien assignée à ce livreur avant tout changement.
//
// Ces flux sont volontairement isolés de la state machine autoritaire de
// updateOrders.service (pending→processing→...) : la délégation livreur est un
// canal parallèle piloté par le frontend, on pose donc le statut tel quel.
//
// Émissions socket (toutes fiabilisées via reliableEmit → room = uid) :
//   - `driverOrderAssigned`  → livreur (room = driverId = son uid)
//   - `driverOrderUpdated`   → livreur (room = driverId)
//   - `userOrderUpdated`                              → client
//   - `fastFoodOrderUpdated`                          → marchand
//
// ⚠️ Le livreur EST un user : `driverId` est son uid. Il a déjà rejoint sa room via
// `join_user` (même mécanisme que client et marchand). On émet donc vers `driverId`
// directement — pas de room dédiée ni de `join_driver`.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { reliableEmit } = require('../../utils/reliableEmit');

const DRIVER_ALLOWED_STATUSES = new Set(['delivering', 'finished']);

const notifyClientAndMerchant = async (order) => {
  const io = getIO();
  await reliableEmit(io, order.userId, 'userOrderUpdated', { data: order });
  const fastFood = await getFastFoodService(order.fastFoodId);
  if (fastFood?.userId) {
    await reliableEmit(io, fastFood.userId, 'fastFoodOrderUpdated', { data: order });
  }
};

/**
 * Le fastFood assigne une commande à un livreur.
 * @param {string} orderId
 * @param {string} driverId
 * @param {object} [prevData] commande déjà lue (optimisation)
 */
exports.assignDriver = async (orderId, driverId, prevData = null) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!driverId) return { success: false, message: 'driverId est requis' };

  const order = prevData || (await repos.orders.getById(orderId));
  if (!order) return { success: false, message: 'Commande non trouvée' };

  const updatedOrder = await repos.orders.update(orderId, { driverId });

  const io = getIO();
  await reliableEmit(io, driverId, 'driverOrderAssigned', { data: updatedOrder });
  await notifyClientAndMerchant(updatedOrder);

  return { success: true, message: 'Commande assignée au livreur', data: updatedOrder };
};

/**
 * Le livreur fait progresser une commande qui lui est assignée.
 * @param {string} orderId
 * @param {string} driverId
 * @param {string} status  'delivering' | 'finished'
 * @param {object} [prevData]
 */
exports.driverUpdateStatus = async (orderId, driverId, status, prevData = null) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!driverId) return { success: false, message: 'driverId est requis' };
  if (!DRIVER_ALLOWED_STATUSES.has(status)) {
    return { success: false, message: `Statut non autorisé pour un livreur : ${status}`, code: 400 };
  }

  const order = prevData || (await repos.orders.getById(orderId));
  if (!order) return { success: false, message: 'Commande non trouvée', code: 404 };

  if (order.driverId !== driverId) {
    return { success: false, message: "Cette commande n'est pas assignée à ce livreur", code: 403 };
  }

  const updatedOrder = await repos.orders.update(orderId, { status });

  const io = getIO();
  await reliableEmit(io, driverId, 'driverOrderUpdated', { data: updatedOrder });
  await notifyClientAndMerchant(updatedOrder);

  return { success: true, message: 'Statut de la commande mis à jour', data: updatedOrder };
};

exports.getDriverOrders = async (driverId) => {
  if (!driverId) throw new Error('driverId requis');
  return repos.orders.getByDriver(driverId);
};
