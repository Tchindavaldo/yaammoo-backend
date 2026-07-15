// ============================================================================
// rateMenu.service — Un client note un PLAT qu'il a reçu
// ============================================================================
// Garde métier (non contournable, ne fait PAS confiance au front) :
//   - la commande `orderId` existe, appartient à CE user (uid),
//   - elle est au statut `delivered`,
//   - elle contient bien CE plat (order.menu.id === menuId).
// Puis upsert atomique (repos.ratings.rate → RPC rate_target) : une note par
// (user, plat), re-noter met à jour. La moyenne `menus.rating_avg/count` est
// recalculée dans la fonction SQL.
//
// Sockets (reliableEmit) → moyenne à jour diffusée à :
//   - le MARCHAND (fastfoods.userId)
//   - le USER qui note (sync multi-device)
// Event : `menuRatingUpdated` { data: { menuId, ratingAvg, ratingCount, value } }
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { reliableEmit } = require('../../utils/reliableEmit');

exports.rateMenu = async ({ menuId, userId, orderId, value, comment = null }) => {
  if (!menuId) return { success: false, code: 400, message: 'menuId est requis' };
  if (!userId) return { success: false, code: 401, message: 'Utilisateur non authentifié' };
  if (!orderId) return { success: false, code: 400, message: 'orderId est requis (preuve de commande)' };
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return { success: false, code: 400, message: 'value doit être un entier entre 1 et 5' };
  }

  // --- Garde : commande livrée, à ce user, contenant ce plat ---
  const order = await repos.orders.getById(orderId);
  if (!order) return { success: false, code: 404, message: 'Commande non trouvée' };
  if (order.userId !== userId) {
    return { success: false, code: 403, message: "Cette commande n'appartient pas à cet utilisateur" };
  }
  if (order.status !== 'delivered') {
    return { success: false, code: 403, message: 'Vous ne pouvez noter un plat qu\'après réception (commande livrée)' };
  }
  if (order.menu?.id !== menuId) {
    return { success: false, code: 403, message: 'Cette commande ne contient pas ce plat' };
  }

  // --- Upsert atomique + recalcul moyenne (SQL) ---
  const { rating, ratingAvg, ratingCount } = await repos.ratings.rate({
    targetType: 'menu',
    targetId: menuId,
    userId,
    orderId,
    value: numeric,
    comment,
    extra: { fastFoodId: order.fastFoodId },
  });

  // --- Sockets : moyenne à jour → marchand + user ---
  const io = getIO();
  const payload = { data: { menuId, ratingAvg, ratingCount, value: numeric } };
  await reliableEmit(io, userId, 'menuRatingUpdated', payload);
  const fastFood = await getFastFoodService(order.fastFoodId);
  if (fastFood?.userId) {
    await reliableEmit(io, fastFood.userId, 'menuRatingUpdated', payload);
  }

  return { success: true, message: 'Plat noté', data: { rating, ratingAvg, ratingCount } };
};

exports.getMenuRatings = async (menuId) => {
  if (!menuId) return { success: false, code: 400, message: 'menuId est requis' };
  const ratings = await repos.ratings.listByTarget({ targetType: 'menu', targetId: menuId });
  return { success: true, data: ratings };
};
