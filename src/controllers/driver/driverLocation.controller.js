// ============================================================================
// Suivi du livreur — POST /driver/location · GET /driver/tracking/:orderId
// ============================================================================
// Garde `firebaseAuth` en amont : le livreur est `req.user.uid`, jamais un
// identifiant du corps (personne ne peut écrire la position d'un autre).
// ============================================================================
const { validateDriverLocation } = require('../../utils/validator/validateDriverLocation');
const { recordDriverPosition, getOrderTracking } = require('../../services/driver/driverLocation.service');

const send = (res, result) =>
  result.status < 300
    ? res.status(result.status).json({ success: true, data: result.data })
    : res.status(result.status).json({ success: false, message: result.message });

exports.recordDriverLocationController = async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateDriverLocation(payload);
    if (errors.length > 0) return res.status(400).json({ success: false, message: errors });
    return send(res, await recordDriverPosition(req.user.uid, payload));
  } catch (error) {
    console.error('recordDriverLocation:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOrderTrackingController = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId requis.' });
    return send(res, await getOrderTracking(orderId, req.user.uid));
  } catch (error) {
    console.error('getOrderTracking:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
