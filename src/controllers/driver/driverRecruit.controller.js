const { recruitDriver, answerInvitation } = require('../../services/driver/driverRecruit.service');

const send = (res, result) =>
  result.success
    ? res.status(result.code || 200).json({ success: true, message: result.message, data: result.data })
    : res.status(result.code || 400).json({ success: false, message: result.message });

// POST /driver/recruit/:fastFoodId — le marchand ajoute un livreur (create | add | invite).
exports.recruitDriverController = async (req, res) => {
  try {
    return send(res, await recruitDriver(req.params.fastFoodId, req.body || {}));
  } catch (error) {
    console.error('Erreur ajout livreur :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};

// PUT /driver/invitations/:applicationId — le user invité répond { decision }.
exports.answerInvitationController = async (req, res) => {
  try {
    return send(res, await answerInvitation(req.params.applicationId, req.user?.uid, req.body?.decision));
  } catch (error) {
    console.error('Erreur réponse invitation :', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur.' });
  }
};
