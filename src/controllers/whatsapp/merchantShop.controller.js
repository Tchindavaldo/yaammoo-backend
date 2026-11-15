// PATCH /fastfood/:fastFoodId/whatsapp-orders (admin) : commandes de la boutique envoyées au marchand
// sur WhatsApp. Service : services/whatsapp/merchantShop.service.js. Champs : interface/whatsappWebhookFields.js.
const { setWhatsappOrders } = require('../../services/whatsapp/merchantShop.service');

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
