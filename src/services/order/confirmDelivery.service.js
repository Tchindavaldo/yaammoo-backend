// Validation de la remise d'une commande par le code secret du client (QR code de l'app) :
// delivering -> delivered via updateOrders (même machine à états, mêmes crédits livreur).
// Canaux : scan dans l'app (POST /order/:orderId/confirm-delivery) et message WhatsApp
// « LIVRÉ <orderId> <code> » du marchand sans app (services/whatsapp/merchantOrders.service.js).
// Le QR prouve la livraison. Boutique WhatsApp (`whatsappOrders`) : il déclenche en plus le
// versement automatique de la part du marchand (services/wallet/orderPayout.service.js).
// Seul celui qui livre valide (décision du 16/11/2026) : commande confiée à un livreur -> lui
// seul (son compte dans l'app, ou son numéro WhatsApp) ; sinon la boutique. Un code VALIDE
// envoyé par quelqu'un d'autre est refusé, tracé (app_errors) et signalé sur WhatsApp.
// Doc : architecture/orders.md (« Validation de livraison »).
const repos = require('../../repositories');
const wa = require('../whatsapp/whatsappModule.client');
const { deliveryCodeOf, checkDeliveryCode } = require('./deliveryCode.service');
const { payOrderToMerchant } = require('../wallet/orderPayout.service');
const { notifyDelivered } = require('../whatsapp/merchantTemplates.service');
const { shopNumber, shopPhone, sendText } = require('../whatsapp/merchantChannel');
const { driverPhoneOfOrder } = require('../whatsapp/driver/driverDirectory');
const msg = require('../whatsapp/merchantMessages');

const fail = (httpStatus, message) => ({ success: false, httpStatus, message });

/** Versement de la boutique WhatsApp ; un versement déjà fait est ignoré, un échoué relancé. */
const payoutOf = async (order, fastFood) => {
  if (fastFood?.whatsappOrders !== true) return null;
  try {
    return await payOrderToMerchant(order, fastFood);
  } catch (e) {
    console.error(`❌ [VERSEMENT] Commande ${order.id} : ${e.message}`);
    await repos.appErrors.record({ scope: 'order_payout', code: 'payout_crashed', message: `Versement automatique NON fait (${e.message}). À faire à la main.`, orderId: order.id, userId: fastFood.userId || null, fastFoodId: order.fastFoodId });
    return { status: 'failed', code: 'payout_crashed', message: e.message };
  }
};

/** Lien WhatsApp du QR : ouvre une discussion avec Yaammoo, message prérempli « LIVRÉ <id> <code> ». */
exports.deliveryLinkOf = async orderId => {
  const code = deliveryCodeOf(orderId);
  const phone = await wa.myPhone();
  const text = `LIVRÉ ${orderId} ${code}`;
  return { code, text, whatsappLink: phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null };
};

/**
 * true si l'expéditeur est celui qui livre. Commande confiée à un livreur : lui seul (compte
 * `actorUid` = driverId, ou WhatsApp depuis son numéro). Sinon la boutique : WhatsApp depuis
 * son numéro, ou un compte de l'app (droit orders.deliver vérifié par la route).
 */
const isDeliverer = async (order, fastFood, { actorUid, senderPhone }) => {
  if (order.driverId) return senderPhone ? senderPhone === (await driverPhoneOfOrder(order)) : !!actorUid && actorUid === order.driverId;
  return senderPhone ? senderPhone === (await shopNumber(fastFood)) : !!actorUid;
};

/** Code valide envoyé par un autre que celui qui livre : tracé, et signalé à la boutique / au livreur (WhatsApp). */
const alertWrongSender = async (order, fastFood, { actorUid, senderPhone }) => {
  const who = senderPhone ? `depuis le numéro ${senderPhone}` : `depuis un autre compte de l'app (${actorUid || 'sans compte'})`;
  console.warn(`⚠️ [LIVRAISON] Commande ${order.id} : code valide envoyé ${who}, refusé (pas celui qui livre)`);
  await repos.appErrors
    .record({
      scope: 'delivery_code',
      code: 'wrong_sender',
      message: `Validation de livraison refusée : code valide envoyé ${who}, qui ne livre pas cette commande.`,
      orderId: order.id,
      userId: actorUid || null,
      fastFoodId: order.fastFoodId,
      context: { senderPhone: senderPhone || null, driverId: order.driverId || null },
    })
    .catch(e => console.error(`❌ [LIVRAISON] trace app_errors : ${e.message}`));
  if (fastFood?.whatsappOrders !== true) return;
  const text = `Alerte : quelqu'un a essayé de valider la commande n°${msg.ref(order)} ${who}. C'est refusé : seul ${order.driverId ? 'le livreur de la commande' : 'le numéro de la boutique'} peut la valider.`;
  const targets = new Set([await shopPhone(fastFood), await driverPhoneOfOrder(order)].filter(p => p && p !== senderPhone));
  for (const to of targets) await sendText(to, text).catch(() => {});
};

/**
 * @param {{ orderId, code, actorUid, senderPhone, channel }} p actorUid = compte de l'app qui
 *   valide ; senderPhone = numéro WhatsApp qui a envoyé « LIVRÉ ». channel 'whatsapp' : la
 *   réponse part en message libre (merchantOrders.service), sinon template yam_commande_livree.
 */
exports.confirmDelivery = async ({ orderId, code, actorUid, senderPhone, channel }) => {
  const order = orderId ? await repos.orders.getById(orderId) : null;
  if (!order) return fail(404, 'Commande introuvable');
  if (!checkDeliveryCode(order.id, code)) return fail(400, 'Code de livraison invalide');
  const fastFood = await repos.fastfoods.getById(order.fastFoodId);
  if (!(await isDeliverer(order, fastFood, { actorUid, senderPhone }))) {
    await alertWrongSender(order, fastFood, { actorUid, senderPhone });
    return fail(403, order.driverId ? 'Validation refusée : seul le livreur de cette commande peut la valider' : 'Validation refusée : seule la boutique peut valider cette commande');
  }
  if (order.status === 'delivered') {
    // Rescan : relance le versement s'il avait échoué.
    const payout = await payoutOf(order, fastFood);
    return { success: true, message: 'Commande déjà livrée', order, alreadyDelivered: true, payout };
  }
  if (order.status !== 'delivering') return fail(409, "La commande n'est pas en livraison");

  // Chargé ici : updateOrders -> merchantOrders -> confirmDelivery (dépendance circulaire sinon).
  const { updateOrders } = require('./updateOrders.service');
  const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId }], actorUid || fastFood?.userId, null, { expectedStatus: 'delivering' });
  if (!r?.success) return fail(409, r?.message || 'Validation impossible');
  console.log(`✅ [LIVRAISON] Commande ${order.id} livrée (code validé)`);
  const delivered = await repos.orders.getById(order.id);
  if (channel !== 'whatsapp' && fastFood?.whatsappOrders === true) {
    notifyDelivered(delivered || order).catch(e => console.error(`❌ [WHATSAPP] yam_commande_livree ${order.id} : ${e.message}`));
  }
  return { success: true, message: 'Livraison validée', order: delivered, payout: await payoutOf(delivered || order, fastFood) };
};
