// Boutique WhatsApp (admin) : PATCH /fastfood/:fastFoodId/whatsapp-orders (commandes envoyées au marchand
// sur WhatsApp) et PUT /fastfood/:fastFoodId/payout-number (numéro de versement).
// Service : services/whatsapp/merchantShop.service.js. Champs : interface/whatsappWebhookFields.js.
const { setWhatsappOrders, setShopPayoutNumber } = require('../../services/whatsapp/merchantShop.service');

exports.patchWhatsappOrdersController = async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'enabled : true ou false' });
  try {
    const r = await setWhatsappOrders(req.params.fastFoodId, enabled);
    const { httpStatus, ...body } = r;
    return res.status(httpStatus || 200).json(body);
  } catch (e) {
    console.error('❌ [WHATSAPP] patchWhatsappOrders', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.putShopPayoutNumberController = async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) return res.status(400).json({ success: false, message: 'phoneNumber requis' });
  try {
    const { httpStatus, ...body } = await setShopPayoutNumber(req.params.fastFoodId, phoneNumber.trim());
    return res.status(httpStatus || 200).json(body);
  } catch (e) {
    console.error('❌ [WHATSAPP] putShopPayoutNumber', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
