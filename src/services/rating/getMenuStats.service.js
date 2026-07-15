// ============================================================================
// getMenuStats.service — Stats de commande d'un PLAT, ADAPTÉES au demandeur.
// ============================================================================
// Jumeau de getFastFoodDeliveryStats.service, mais la cible est un plat (menu).
//
//   • self   : le marchand propriétaire du plat (viewerUid === fastfood.userId)
//              → totalOrders (total reçu depuis la création) + ventilation par
//                statut (stats: delivered/inProgress/pending).
//   • client : un user ayant déjà commandé ce plat
//              → totalOrders (total du plat, tous users, = popularité)
//                + myTotalOrders (total de SES commandes de ce plat)
//                + hasRated/canRate. Pas de ventilation par statut côté client.
//   • autre  : 403 (ni propriétaire, ni client de ce plat).
//
// « totalOrders » = commandes réelles reçues (livrées + en cours + en attente),
// HORS annulations, depuis la création du plat.
//
// Aucune donnée n'est stockée : tout est calculé à la volée depuis les commandes
// (countBuckets), comme les stats livreur/fastFood. Le plat porte déjà
// ratingAvg/ratingCount (mapper menu → migration 011).
// ============================================================================
const repos = require('../../repositories');
const { countBuckets } = require('../../utils/orderBuckets');

// Total « commandes reçues » = livrées + en cours + en attente (annulations exclues).
const totalReceived = (b) => b.delivered + b.inProgress + b.pending;

/**
 * @param {string} menuId
 * @param {string} viewerUid  uid de l'appelant (req.user.uid)
 */
exports.getMenuStats = async (menuId, viewerUid) => {
  if (!menuId) return { success: false, code: 400, message: 'menuId est requis' };
  if (!viewerUid) return { success: false, code: 401, message: 'Utilisateur non authentifié' };

  const menu = await repos.menus.getById(menuId);
  if (!menu) return { success: false, code: 404, message: 'Plat non trouvé' };

  const ff = menu.fastFoodId ? await repos.fastfoods.getById(menu.fastFoodId) : null;

  const info = {
    menuId: menu.id,
    fastFoodId: menu.fastFoodId ?? null,
    name: menu.name ?? menu.titre ?? null,
    image: menu.image ?? null,
    ratingAvg: menu.ratingAvg ?? 0,
    ratingCount: menu.ratingCount ?? 0,
  };

  // --- commandes du plat (toutes, tous users) — commun self/client ---
  const allMenuOrders = menu.fastFoodId
    ? (await repos.orders.getByFastFood(menu.fastFoodId)).filter((o) => o.menu?.id === menuId)
    : [];
  const globalBuckets = countBuckets(allMenuOrders);
  const totalOrders = totalReceived(globalBuckets);

  // --- self : le marchand propriétaire → total + ventilation par statut ---
  if (ff && viewerUid === ff.userId) {
    return {
      success: true,
      scope: 'self',
      data: {
        ...info,
        totalOrders,
        stats: {
          delivered: globalBuckets.delivered,
          inProgress: globalBuckets.inProgress,
          pending: globalBuckets.pending,
        },
      },
    };
  }

  // --- client : un user ayant commandé ce plat → total du plat + son total + canRate ---
  const myMenuOrders = allMenuOrders.filter((o) => o.userId === viewerUid);
  if (myMenuOrders.length === 0) {
    return { success: false, code: 403, message: 'Accès réservé au propriétaire du plat ou à un client ayant commandé ce plat' };
  }

  const myBuckets = countBuckets(myMenuOrders);
  const existingRating = await repos.ratings.getUserRating({
    targetType: 'menu',
    targetId: menuId,
    userId: viewerUid,
  });

  return {
    success: true,
    scope: 'client',
    data: {
      ...info,
      totalOrders,
      myTotalOrders: totalReceived(myBuckets),
      hasRated: !!existingRating,
      canRate: myBuckets.delivered > 0 && !existingRating,
    },
  };
};
