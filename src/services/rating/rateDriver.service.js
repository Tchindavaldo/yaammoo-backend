// ============================================================================
// rateDriver.service — Un client note le LIVREUR d'une commande reçue
// ============================================================================
// Garde métier (non contournable) :
//   - la commande `orderId` existe, appartient à CE user (uid),
//   - elle est au statut `delivered`,
//   - elle a bien été livrée par CE livreur (order.driverId === driverId).
// Upsert atomique (repos.ratings.rate → RPC rate_target, target_type='driver') :
// une note par (user, livreur). La moyenne `users.driver_rating_avg/count` est
// recalculée dans la fonction SQL. La note porte son CONTEXTE dans extra_data
// (orderId, fastFoodId, heure de livraison…) — réutilisable pour l'historique.
//
// Sockets (reliableEmit) → moyenne à jour diffusée à :
//   - le LIVREUR (driverId = son uid)
//   - le USER qui note (sync multi-device)
//   - le MARCHAND (fastfoods.userId) — pour suivre sa flotte
// Event : `driverRatingUpdated` { data: { driverId, ratingAvg, ratingCount, value } }
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { reliableEmit } = require('../../utils/reliableEmit');

exports.rateDriver = async ({ driverId, userId, orderId, value, comment = null }) => {
  if (!driverId) return { success: false, code: 400, message: 'driverId est requis' };
  if (!userId) return { success: false, code: 401, message: 'Utilisateur non authentifié' };
  if (!orderId) return { success: false, code: 400, message: 'orderId est requis (preuve de livraison)' };
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return { success: false, code: 400, message: 'value doit être un entier entre 1 et 5' };
  }

  // --- Garde : commande livrée, à ce user, livrée par ce livreur ---
  const order = await repos.orders.getById(orderId);
  if (!order) return { success: false, code: 404, message: 'Commande non trouvée' };
  if (order.userId !== userId) {
    return { success: false, code: 403, message: "Cette commande n'appartient pas à cet utilisateur" };
  }
  if (order.status !== 'delivered') {
    return { success: false, code: 403, message: 'Vous ne pouvez noter le livreur qu\'après réception (commande livrée)' };
  }
  if (!order.driverId || order.driverId !== driverId) {
    return { success: false, code: 403, message: "Cette commande n'a pas été livrée par ce livreur" };
  }

  // --- Upsert atomique + recalcul moyenne (SQL) ---
  const { rating, ratingAvg, ratingCount } = await repos.ratings.rate({
    targetType: 'driver',
    targetId: driverId,
    userId,
    orderId,
    value: numeric,
    comment,
    extra: {
      fastFoodId: order.fastFoodId,
      deliveredAt: order.updatedAt || null,
      deliveryDate: order.delivery?.date || null,
    },
  });

  // --- Sockets : moyenne à jour → livreur + user + marchand ---
  const io = getIO();
  const payload = { data: { driverId, ratingAvg, ratingCount, value: numeric } };
  await reliableEmit(io, driverId, 'driverRatingUpdated', payload);
  await reliableEmit(io, userId, 'driverRatingUpdated', payload);
  const fastFood = await getFastFoodService(order.fastFoodId);
  if (fastFood?.userId) {
    await reliableEmit(io, fastFood.userId, 'driverRatingUpdated', payload);
  }

  return { success: true, message: 'Livreur noté', data: { rating, ratingAvg, ratingCount } };
};

exports.getDriverRatings = async (driverId) => {
  if (!driverId) return { success: false, code: 400, message: 'driverId est requis' };
  const ratings = await repos.ratings.listByTarget({ targetType: 'driver', targetId: driverId });
  return { success: true, data: ratings };
};
