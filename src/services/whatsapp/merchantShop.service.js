// Réglage admin « boutique WhatsApp » : les commandes de la boutique sont envoyées au marchand
// sur WhatsApp (fastfoods.extra_data.whatsappOrders), et son numéro de versement (payout_numbers).
// Controller : controllers/whatsapp/merchantShop.controller.js.
const repos = require('../../repositories');
const mobilewallet = require('../transaction/mobilewalletService');
const { getOtpSettings } = require('../settings/settings.service');
const { normalizePhoneNumber } = require('../../utils/validator/validatePhoneNumber');

/** Active ou coupe le mode WhatsApp ; l'activer exige un numéro WhatsApp valide sur la boutique. */
exports.setWhatsappOrders = async (fastFoodId, enabled) => {
  const shop = await repos.fastfoods.getById(fastFoodId);
  if (!shop) return { success: false, httpStatus: 404, message: 'Boutique introuvable' };
  if (enabled) {
    const { defaultCountryCode } = await getOtpSettings();
    if (!normalizePhoneNumber(shop.whatsappNumber, defaultCountryCode)) {
      return { success: false, httpStatus: 400, message: "Renseigner d'abord un numéro WhatsApp valide sur la boutique (whatsappNumber)." };
    }
  }
  const updated = await repos.fastfoods.update(fastFoodId, { whatsappOrders: enabled });
  console.log(`✅ [WHATSAPP] Boutique ${fastFoodId} : commandes par WhatsApp ${enabled ? 'activées' : 'coupées'}`);
  return {
    success: true,
    message: enabled ? 'Commandes envoyées au marchand sur WhatsApp' : 'Commandes par WhatsApp coupées',
    fastFood: { id: updated.id, whatsappOrders: updated.whatsappOrders === true, whatsappNumber: updated.whatsappNumber },
  };
};

/**
 * Numéro de versement saisi par l'admin à la création de la boutique (pas de code SMS) :
 * enregistré comme numéro vérifié du propriétaire. Reçoit les versements automatiques
 * des commandes livrées (wallet/orderPayout.service.js) et sert aux retraits de l'app.
 */
exports.setShopPayoutNumber = async (fastFoodId, phoneNumber) => {
  const shop = await repos.fastfoods.getById(fastFoodId);
  if (!shop) return { success: false, httpStatus: 404, message: 'Boutique introuvable' };
  if (!shop.userId) return { success: false, httpStatus: 400, message: "La boutique n'a pas de propriétaire (userId)." };
  const { defaultCountryCode } = await getOtpSettings();
  const phone = normalizePhoneNumber(phoneNumber, defaultCountryCode);
  if (!phone) return { success: false, httpStatus: 400, message: `Numéro invalide : ${phoneNumber}` };
  const op = await mobilewallet.predictOperator({ phone });
  if (!op.success) return { success: false, httpStatus: op.httpStatus || 502, message: op.message };
  if (!op.network) return { success: false, httpStatus: 400, message: "Ce numéro n'est ni Orange Money ni MTN MoMo." };
  await repos.payoutNumbers.markVerified(shop.userId, phone);
  console.log(`✅ [WHATSAPP] Boutique ${fastFoodId} : numéro de versement ${phone} (${op.network})`);
  return { success: true, message: 'Numéro de versement enregistré', payoutNumber: { phoneNumber: phone, network: op.network } };
};
