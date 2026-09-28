// ============================================================================
// driverLocation.service — suivi du livreur en course (migration 060)
// ============================================================================
// 1. `recordDriverPosition` (POST /driver/location) : le livreur envoie sa
//    position toutes les ~10 s tant qu'il a une course `delivering`. Elle est
//    écrasée dans `driver_positions` puis poussée, par socket, à chaque client
//    concerné (`driverLocationUpdated`, room = uid du client).
//    Aucune course en cours : rien n'est stocké ni diffusé, et la réponse
//    `activeDeliveries: 0` dit à l'app de quitter le mode livraison.
// 2. `getOrderTracking` (GET /driver/tracking/:orderId) : état initial de
//    l'onglet « Suivi » (dernière position du livreur + destination).
//
// Event fire-and-forget (non rejoué) : une position périmée n'a aucune valeur,
// l'ouverture de l'onglet relit l'état par HTTP.
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { resolveCapturedAt } = require('../user/userLocation.service');

const DELIVERING = 'delivering';

/**
 * @param {string} driverId uid du Bearer
 * @param {object} location payload validé (`validateDriverLocation`)
 */
exports.recordDriverPosition = async (driverId, location) => {
  const orders = await repos.orders.getLightByDriverAndStatus(driverId, DELIVERING);
  if (orders.length === 0) return { status: 200, data: { activeDeliveries: 0 } };

  const position = {
    driverId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    speed: location.speed ?? null,
    heading: location.heading ?? null,
    capturedAt: resolveCapturedAt(location.capturedAt),
  };
  await repos.driverPositions.upsert(position);

  // Un envoi par client : un livreur peut porter plusieurs commandes d'un même
  // client (livraison groupée) ou de plusieurs clients.
  const byUser = new Map();
  for (const o of orders) {
    if (!o.userId) continue;
    if (!byUser.has(o.userId)) byUser.set(o.userId, []);
    byUser.get(o.userId).push(o.id);
  }
  const io = getIO();
  for (const [userId, orderIds] of byUser) {
    io.to(userId).emit('driverLocationUpdated', { data: { ...position, orderIds } });
  }

  return { status: 200, data: { activeDeliveries: orders.length } };
};

/**
 * État de suivi d'une commande, pour son client, son livreur ou le
 * propriétaire de la boutique.
 * @returns {Promise<{status:number, data?:object, message?:string}>}
 */
exports.getOrderTracking = async (orderId, viewerUid) => {
  const order = await repos.orders.getById(orderId);
  if (!order) return { status: 404, message: 'Commande introuvable.' };

  let allowed = viewerUid === order.userId || (!!order.driverId && viewerUid === order.driverId);
  if (!allowed && order.fastFoodId) {
    const shop = await repos.fastfoods.getById(order.fastFoodId);
    allowed = !!shop && shop.userId === viewerUid;
  }
  if (!allowed) return { status: 403, message: 'Accès refusé.' };

  const tracking = order.status === DELIVERING && !!order.driverId;
  const [driver, destination] = await Promise.all([
    tracking ? repos.driverPositions.getByDriver(order.driverId) : null,
    // Destination : dernière position connue du client (la commande ne porte
    // qu'une adresse texte). L'app du client la remplace par sa position live.
    tracking ? repos.userLocations.getLatest(order.userId) : null,
  ]);

  return {
    status: 200,
    data: {
      orderId: order.id,
      status: order.status,
      driverId: order.driverId || null,
      driver: driver || null,
      destination: destination || null,
    },
  };
};
