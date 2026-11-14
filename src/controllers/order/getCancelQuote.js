const repos = require('../../repositories');
const { cancelRefusal, quoteCancel } = require('../../services/order/orderCancel.service');

/**
 * GET /order/cancel-quote/:userId/:orderId
 * Devis d'annulation par le client : montant rendu et frais réels retenus.
 */
exports.getCancelQuote = async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    const order = await repos.orders.getById(orderId);
    if (!order || String(order.userId) !== String(userId)) return res.status(404).json({ success: false, message: 'Commande introuvable.' });
    const refusal = cancelRefusal(order.status, 'cancelByUser');
    if (refusal || order.status === 'pendingToBuy') return res.status(409).json({ success: false, code: 'not_cancellable', message: refusal || 'Commande non payée.' });
    const quote = await quoteCancel(order, 'cancelByUser');
    return res.status(200).json({ success: true, data: quote });
  } catch (error) {
    console.error('[getCancelQuote]', error);
    return res.status(500).json({ success: false, message: "Erreur serveur lors du calcul de l'annulation.", error: error.message });
  }
};
