const repos = require('../../repositories');
const { cancelRefusal, quoteCancel } = require('../../services/order/orderCancel.service');

/**
 * GET /order/:orderId/merchant-cancel-quote
 * Devis d'annulation PAR LA BOUTIQUE (droit orders.cancel) : montant rendu au
 * client (base complète) et frais réels de l'annulation, débités du marchand.
 * Rien n'est écrit. Utilisé par l'app avant « Oui, annuler » (PUT /order cancelByFastFood).
 */
exports.getMerchantCancelQuote = async (req, res) => {
  try {
    const order = await repos.orders.getById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable.' });
    const refusal = cancelRefusal(order.status, 'cancelByFastFood');
    if (refusal || order.status === 'pendingToBuy') return res.status(409).json({ success: false, code: 'not_cancellable', message: refusal || 'Commande non payée.' });
    const quote = await quoteCancel(order, 'cancelByFastFood');
    return res.status(200).json({ success: true, data: quote });
  } catch (error) {
    console.error('[getMerchantCancelQuote]', error);
    return res.status(500).json({ success: false, message: "Erreur serveur lors du calcul de l'annulation.", error: error.message });
  }
};
