// ============================================================================
// getFastFoodDeliveryStats.service — Stats de livraison quand le fastFood
// livre LUI-MÊME (order.driverId === fastFoodId), ADAPTÉES au demandeur.
// ============================================================================
// Jumeau de getDriverProfile.service, mais la cible est un fastFood-livreur.
//
//   • self   : le marchand propriétaire (viewerUid === fastfood.userId)
//              → stats GLOBALES de ses auto-livraisons.
//   • client : un user ayant commandé dans cette boutique
//              → SES stats avec cette boutique + hasRated/canRate.
//   • autre  : 403 (ni propriétaire, ni client).
//
// Critère « livrée par le fastFood lui-même » : order.driverId === fastFoodId.
// Note boutique-livreuse : système ratings polymorphe, target_type='fastfoodDriver'
// (moyenne sur fastfoods.driver_rating_avg/count — migration 012).
// ============================================================================
const repos = require('../../repositories');
const { countBuckets } = require('../../utils/orderBuckets');

/**
 * @param {string} fastFoodId
 * @param {string} viewerUid  uid de l'appelant (req.user.uid)
 */
exports.getFastFoodDeliveryStats = async (fastFoodId, viewerUid) => {
  if (!fastFoodId) return { success: false, code: 400, message: 'fastFoodId est requis' };
  if (!viewerUid) return { success: false, code: 401, message: 'Utilisateur non authentifié' };

  const ff = await repos.fastfoods.getById(fastFoodId);
  if (!ff) return { success: false, code: 404, message: 'FastFood non trouvé' };

  const info = {
    fastFoodId: ff.id,
    userId: ff.userId,
    name: ff.name,
    image: ff.image ?? null,
    ratingAvg: ff.driverRatingAvg ?? 0,
    ratingCount: ff.driverRatingCount ?? 0,
  };

  // --- self : le marchand propriétaire → stats globales des auto-livraisons ---
  if (viewerUid === ff.userId) {
    const all = await repos.orders.getByFastFood(fastFoodId);
    const selfDelivered = all.filter((o) => o.driverId === fastFoodId);
    return { success: true, scope: 'self', data: { ...info, stats: countBuckets(selfDelivered) } };
  }

  // --- client : un user ayant commandé dans cette boutique → SES stats + canRate ---
  const myOrders = await repos.orders.query({ fastFoodId, userId: viewerUid });
  if (myOrders.length === 0) {
    return { success: false, code: 403, message: 'Accès réservé au propriétaire ou à un client de la boutique' };
  }

  const mySelfDelivered = myOrders.filter((o) => o.driverId === fastFoodId);
  const myStats = countBuckets(mySelfDelivered);
  const existingRating = await repos.ratings.getUserRating({
    targetType: 'fastfoodDriver',
    targetId: fastFoodId,
    userId: viewerUid,
  });

  return {
    success: true,
    scope: 'client',
    data: {
      ...info,
      myStats,
      hasRated: !!existingRating,
      canRate: myStats.delivered > 0 && !existingRating,
    },
  };
};
