// ============================================================================
// getOrderRating.service — Notes laissées par un user pour ses commandes
// ============================================================================
// Permet à un client de récupérer la note (value + comment) qu'il a donnée
// pour le plat ET/OU le livreur d'une commande donnée.
//
// Garde métier :
//   - La commande `orderId` existe et appartient à cet user (uid)
//   - On cherche dans ratings les lignes (user_id, order_id) pour 'menu'
//     et 'driver' target_type
// ============================================================================
const repos = require('../../repositories');

/**
 * Récupère les notes laissées par un user pour une commande.
 */
exports.getOrderRating = async ({ orderId, userId }) => {
  if (!orderId) return { success: false, code: 400, message: 'orderId est requis' };
  if (!userId) return { success: false, code: 401, message: 'Utilisateur non authentifié' };

  // --- Garde : la commande existe et appartient à cet user ---
  const order = await repos.orders.getById(orderId);
  if (!order) return { success: false, code: 404, message: 'Commande non trouvée' };
  if (order.userId !== userId) {
    return { success: false, code: 403, message: "Cette commande n'appartient pas à cet utilisateur" };
  }

  // --- Chercher la note plat (target_type='menu', targetId=menu.id) ---
  let menuRating = null;
  if (order.menu?.id) {
    menuRating = await repos.ratings.getUserRating({
      targetType: 'menu',
      targetId: order.menu.id,
      userId,
    });
  }

  // --- Chercher la note livreur (target_type='driver', targetId=driverId) ---
  let driverRating = null;
  if (order.driverId) {
    driverRating = await repos.ratings.getUserRating({
      targetType: 'driver',
      targetId: order.driverId,
      userId,
    });
  }

  return {
    success: true,
    data: {
      orderId,
      menuRating: menuRating || null,
      driverRating: driverRating || null,
    },
  };
};
