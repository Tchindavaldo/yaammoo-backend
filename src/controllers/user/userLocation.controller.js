// ============================================================================
// POST /user/location — position de l'utilisateur connecté (migration 054)
// ============================================================================
// Garde `firebaseAuth` en amont : l'utilisateur est `req.user.uid`, jamais un
// identifiant du corps (personne ne peut écrire la position d'un autre).
// ============================================================================
const { validateUserLocation } = require('../../utils/validator/validateUserLocation');
const { recordUserLocation } = require('../../services/user/userLocation.service');

exports.recordUserLocationController = async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateUserLocation(payload);
    if (errors.length > 0) return res.status(400).json({ success: false, message: errors });

    const result = await recordUserLocation(req.user.uid, payload);
    return result.status < 300
      ? res.status(result.status).json({ success: true, data: result.data })
      : res.status(result.status).json({ success: false, message: result.message });
  } catch (error) {
    console.error('recordUserLocation:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
