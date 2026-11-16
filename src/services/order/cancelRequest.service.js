// ============================================================================
// cancelRequest.service — Annulation sur DEMANDE (boutique WhatsApp)
// ============================================================================
// Boutique normale : le client annule directement une commande en attente
// (`cancelByUser`, orderCancel.service). Boutique WhatsApp (`whatsappOrders`) : le
// marchand n'a pas l'app et doit pouvoir suivre ; l'annulation devient une DEMANDE
// (`order.cancelRequest`, extra_data) que le marchand accepte ou refuse sur WhatsApp
// (services/whatsapp/merchantCancelRequests.service.js).
//
//   cancelRequest = { status: pending | accepted | refused | closed, requestedAt,
//                     resolvedAt?, reason? }
//
// - Accepter  -> `cancelByUser` via updateOrders (remboursement règle CLIENT,
//               architecture/order-cancel.md) ; demande `accepted`.
// - Refuser   -> commande maintenue `pending` ; demande `refused` (définitif).
// - Le marchand accepte la COMMANDE entre-temps -> demande `refused`
//   (`reason: 'accepted_order'`) ; il la refuse -> `closed` (remboursement complet).
// Sans réponse : la demande reste en attente (décision du 16/11/2026).
// Concurrence : toute écriture exige le statut `pending` (verrou optimiste du repo).
// Doc : architecture/order-cancel.md (« Annulation sur demande »).
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');
const { shopSender } = require('../notification/helpers/shopSender');

const CHANGED = 'Le restaurant a déjà accepté cette commande : elle ne peut plus être annulée.';

/** Boutique dont le client DEMANDE l'annulation au lieu d'annuler (marchand WhatsApp). */
exports.requiresCancelRequest = fastFood => fastFood?.whatsappOrders === true;

/** Commande à jour poussée au client et au marchand (donnée complète, R24). */
const emitOrder = async order => {
  try {
    const io = getIO();
    await reliableEmit(io, order.userId, 'userOrderUpdated', { data: order });
    const shop = await repos.fastfoods.getById(order.fastFoodId);
    if (shop?.userId) {
      const { toMerchantViewOne } = require('./toMerchantView');
      await reliableEmit(io, shop.userId, 'fastFoodOrderUpdated', { data: await toMerchantViewOne(order) });
    }
  } catch (e) {
    console.warn('[cancelRequest] emit :', e.message);
  }
};

const notifyClient = async (order, title, body) => {
  const shop = await repos.fastfoods.getById(order.fastFoodId).catch(() => null);
  await notifyOrderEvent({ targetUserId: order.userId, type: 'order_cancel_request', title, body, orderId: order.id, route: '/(tabs)/cart?section=active', sender: shopSender(shop) }).catch(e =>
    console.warn('[cancelRequest] push :', e.message)
  );
};

/**
 * Champ `cancelRequest` à écrire avec une transition de statut (updateOrders), ou null.
 * Une demande en attente se règle d'elle-même quand la commande quitte `pending`.
 */
exports.cancelRequestOnTransition = (prevData, newStatus, { fromCancelRequest } = {}) => {
  const cr = prevData?.cancelRequest;
  if (cr?.status !== 'pending' || newStatus === prevData.status) return null;
  const resolvedAt = new Date().toISOString();
  if (newStatus === 'cancelByUser' && fromCancelRequest) return { ...cr, status: 'accepted', resolvedAt };
  if (newStatus === 'processing') return { ...cr, status: 'refused', reason: 'accepted_order', resolvedAt };
  return { ...cr, status: 'closed', reason: newStatus, resolvedAt };
};

/**
 * Le client demande l'annulation d'une commande EN ATTENTE d'une boutique WhatsApp.
 * Rien n'est annulé : la demande part au marchand. Idempotent (déjà demandée = ok).
 * @returns {Promise<{ ok: boolean, order?: object, message?: string }>}
 */
exports.requestCancel = async (order, fastFood) => {
  const cr = order.cancelRequest;
  if (cr?.status === 'pending') return { ok: true, order };
  if (cr?.status === 'refused') return { ok: false, message: "Le restaurant a refusé l'annulation : votre commande est maintenue." };
  const updated = await repos.orders.update(order.id, { cancelRequest: { status: 'pending', requestedAt: new Date().toISOString() } }, { expectedStatus: 'pending' });
  if (!updated) return { ok: false, message: CHANGED };
  await emitOrder(updated);
  // Chargé ici : le flux WhatsApp charge ce fichier.
  await require('../whatsapp/merchantCancelRequests.service').notifyCancelRequest(updated, fastFood);
  return { ok: true, order: updated };
};

/** Le marchand accepte la demande : annulation `cancelByUser` (remboursement règle client). */
exports.acceptCancelRequest = async orderId => {
  const order = await repos.orders.getById(orderId);
  if (!order || order.cancelRequest?.status !== 'pending') return { ok: false, message: "Aucune demande d'annulation en attente." };
  if (order.status !== 'pending') return { ok: false, message: 'La commande a changé de statut.' };
  // Chargé ici : updateOrders charge ce fichier.
  const { updateOrders } = require('./updateOrders.service');
  const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId, status: 'cancelByUser' }], order.userId, null, { fromCancelRequest: true });
  if (!r?.success) return { ok: false, message: r?.message || 'Annulation impossible.' };
  await notifyClient(order, 'Annulation acceptée', "Le restaurant a accepté l'annulation. Le remboursement est en cours.");
  return { ok: true, order: r.data?.[0] || order };
};

/** Le marchand refuse la demande : la commande est maintenue (en attente). */
exports.refuseCancelRequest = async orderId => {
  const order = await repos.orders.getById(orderId);
  if (!order || order.cancelRequest?.status !== 'pending') return { ok: false, message: "Aucune demande d'annulation en attente." };
  const cancelRequest = { ...order.cancelRequest, status: 'refused', reason: 'merchant', resolvedAt: new Date().toISOString() };
  const updated = await repos.orders.update(order.id, { cancelRequest }, { expectedStatus: 'pending' });
  if (!updated) return { ok: false, message: 'La commande a changé de statut.' };
  await emitOrder(updated);
  await notifyClient(updated, 'Annulation refusée', "Le restaurant a refusé l'annulation : votre commande est maintenue.");
  return { ok: true, order: updated };
};
