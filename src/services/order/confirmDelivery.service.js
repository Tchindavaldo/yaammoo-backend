// Validation de la remise d'une commande par le code secret du client (QR code de l'app) :
// delivering -> delivered via updateOrders (même machine à états, mêmes crédits livreur).
// Canaux : scan dans l'app (POST /order/:orderId/confirm-delivery) et message WhatsApp
// « LIVRÉ <orderId> <code> » du marchand sans app (services/whatsapp/merchantOrders.service.js).
// Le QR ne paie rien : il prouve la livraison. Doc : architecture/orders.md (« Validation de livraison »).
const repos = require('../../repositories');
const wa = require('../whatsapp/whatsappModule.client');
const { deliveryCodeOf, checkDeliveryCode } = require('./deliveryCode.service');

const fail = (httpStatus, message) => ({ success: false, httpStatus, message });

/** Lien WhatsApp du QR : ouvre une discussion avec Yaammoo, message prérempli « LIVRÉ <id> <code> ». */
exports.deliveryLinkOf = async orderId => {
  const code = deliveryCodeOf(orderId);
  const phone = await wa.myPhone();
  const text = `LIVRÉ ${orderId} ${code}`;
  return { code, text, whatsappLink: phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null };
};

/**
 * @param {{ orderId, code, actorUid }} p actorUid = qui valide (marchand, staff, livreur) ;
 *   absent (canal WhatsApp) : le propriétaire de la boutique.
 */
exports.confirmDelivery = async ({ orderId, code, actorUid }) => {
  const order = orderId ? await repos.orders.getById(orderId) : null;
  if (!order) return fail(404, 'Commande introuvable');
  if (!checkDeliveryCode(order.id, code)) return fail(400, 'Code de livraison invalide');
  if (order.status === 'delivered') return { success: true, message: 'Commande déjà livrée', order, alreadyDelivered: true };
  if (order.status !== 'delivering') return fail(409, "La commande n'est pas en livraison");

  const fastFood = await repos.fastfoods.getById(order.fastFoodId);
  // Chargé ici : updateOrders -> merchantOrders -> confirmDelivery (dépendance circulaire sinon).
  const { updateOrders } = require('./updateOrders.service');
  const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId }], actorUid || fastFood?.userId);
  if (!r?.success) return fail(409, r?.message || 'Validation impossible');
  console.log(`✅ [LIVRAISON] Commande ${order.id} livrée (code validé)`);
  // Boutique WhatsApp : versement automatique de la part du marchand (à venir, todo
  // fastfood/feature/whatsapp-commandes-marchand.md, décisions d'argent en attente).
  return { success: true, message: 'Livraison validée', order: await repos.orders.getById(order.id) };
};
