// Réglage admin « boutique WhatsApp » : les commandes de la boutique sont envoyées au marchand
// sur WhatsApp (fastfoods.extra_data.whatsappOrders). Controller : controllers/whatsapp/merchantShop.controller.js.
const repos = require('../../repositories');
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
