// Validation de livraison par QR code. GET /order/:orderId/delivery-code (client de la commande) :
// code + lien WhatsApp du QR. POST /order/:orderId/confirm-delivery (boutique ou livreur assigné) :
// valide la remise. Services : services/order/confirmDelivery.service.js. Champs : interface/orderFields.js.
const { deliveryLinkOf, confirmDelivery } = require('../../services/order/confirmDelivery.service');

exports.getDeliveryCode = async (req, res) => {
  try {
    const link = await deliveryLinkOf(req.params.orderId);
    return res.status(200).json({ success: true, ...link });
  } catch (e) {
    console.error('❌ [LIVRAISON] getDeliveryCode', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.confirmDeliveryController = async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ success: false, message: 'code requis' });
  try {
    const { httpStatus, ...body } = await confirmDelivery({ orderId: req.params.orderId, code, actorUid: req.user?.uid });
    return res.status(httpStatus || 200).json(body);
  } catch (e) {
    console.error('❌ [LIVRAISON] confirmDelivery', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
