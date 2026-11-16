// controllers/order/updateOrder.js
const { updateOrderService } = require('../../services/order/updateOrder');
const { clientSupportsFeature, KEYS } = require('../../services/settings/settings.service');

exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.body;
    const updateData = req.body;

    const result = await updateOrderService(id, updateData);
    if (result && result.success === false) {
      return res.status(result.code || 400).json({ success: false, message: result.message });
    }
    // Annulation sur demande (boutique WhatsApp, R11) : une app sous
    // `cancel_request_min_app_version` afficherait « Commande annulée » sur un succès ;
    // elle reçoit un refus portant le message (demande envoyée, en attente du marchand).
    if (result?.cancelRequested && !(await clientSupportsFeature(req, KEYS.CANCEL_REQUEST_MIN_APP_VERSION))) {
      return res.status(409).json({ success: false, code: 'cancel_requested', message: result.message });
    }
    // Shape historique conservée : data = objet résultat complet du service.
    res.status(200).json({ message: 'success.', data: result });
  } catch (error) {
    console.error('Erreur mise à jour commande :', error.message);
    res.status(error.code || 500).json({
      message: error.message || 'Erreur serveur lors de la mise à jour de la commande.',
    });
  }
};
