// ============================================================================
// driverOrders.service — Délégation d'une commande à un livreur (driver)
// ============================================================================
// Flux :
//   1. Le fastFood ASSIGNE une commande à un livreur → assignDriver()
//      (pose order.driverId) → event `driverOrderAssigned` (→ room uid du livreur).
//   2. Le livreur fait AVANCER la commande → driverAdvanceStatus()
//      Le livreur n'envoie PAS de statut : on délègue à la MÊME machine à états
//      que le reste (updateOrders.service), qui avance automatiquement
//      `finished → delivering → delivered`. On vérifie juste que la commande lui
//      est bien assignée et qu'elle est à une étape avançable par le livreur.
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
const { updateOrders } = require('./updateOrders.service');

// Étapes depuis lesquelles le livreur peut faire avancer la commande.
// (finished = prête → delivering ; delivering → delivered)
const DRIVER_ADVANCE_FROM = new Set(['finished', 'delivering']);

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
 * Le livreur fait AVANCER une commande qui lui est assignée.
 * Ne prend PAS de statut : la machine à états (updateOrders.service) décide
 * `finished → delivering → delivered`.
 * @param {string} orderId
 * @param {string} driverId
 * @param {object} [prevData]
 */
exports.driverAdvanceStatus = async (orderId, driverId, prevData = null) => {
  if (!orderId) return { success: false, message: 'ID de la commande est requis' };
  if (!driverId) return { success: false, message: 'driverId est requis' };

  const order = prevData || (await repos.orders.getById(orderId));
  if (!order) return { success: false, message: 'Commande non trouvée', code: 404 };

  if (order.driverId !== driverId) {
    return { success: false, message: "Cette commande n'est pas assignée à ce livreur", code: 403 };
  }
  if (!DRIVER_ADVANCE_FROM.has(order.status)) {
    return { success: false, code: 409, message: `Le livreur ne peut pas faire avancer une commande au statut "${order.status}"` };
  }

  // Délégation à la machine à états autoritaire (même logique que pending→processing…).
  const result = await updateOrders([{ id: orderId, fastFoodId: order.fastFoodId }], order.userId);
  if (!result.success) return result;

  const updatedOrder = result.data?.[0] || (await repos.orders.getById(orderId));
  // updateOrders a déjà émis userOrderUpdated + fastFoodOrderUpdated ; on ajoute l'event livreur.
  await reliableEmit(getIO(), driverId, 'driverOrderUpdated', { data: updatedOrder });

  return { success: true, message: result.message, data: updatedOrder };
};

exports.getDriverOrders = async (driverId) => {
  if (!driverId) throw new Error('driverId requis');
  return repos.orders.getByDriver(driverId);
};
