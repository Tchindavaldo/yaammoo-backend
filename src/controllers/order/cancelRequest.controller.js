// controllers/order/cancelRequest.controller.js
// Réponse du marchand (dans l'app) à une demande d'annulation du client.
// POST /order/:orderId/cancel-request/accept  -> commande `cancelByUser` (remboursement règle client)
// POST /order/:orderId/cancel-request/refuse  -> commande maintenue `pending`
// Logique : services/order/cancelRequest.service.js. Doc : architecture/order-cancel.md.
const { acceptCancelRequest, refuseCancelRequest } = require('../../services/order/cancelRequest.service');

const respond = decide => async (req, res) => {
  try {
    const r = await decide(req.params.orderId);
    if (!r.ok) return res.status(409).json({ success: false, message: r.message });
    return res.status(200).json({ success: true, data: r.order });
  } catch (error) {
    console.error('[cancelRequest] réponse marchand :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

exports.acceptCancelRequestController = respond(acceptCancelRequest);
exports.refuseCancelRequestController = respond(refuseCancelRequest);
