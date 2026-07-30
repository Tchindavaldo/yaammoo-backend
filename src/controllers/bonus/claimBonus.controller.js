const { claimBonusService } = require('../../services/bonus/claimBonus.service');

exports.claimBonusController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const bonusId = req.params.id;
    // Claim multipart pour les bonus à preuve (`status_view`) : `proofVideo` est
    // la vidéo attestant que le flyer a bien été posté en statut. Les autres
    // bonus continuent d'envoyer un claim JSON sans corps.
    const result = await claimBonusService(userId, bonusId, { proofVideo: req.file || null });
    const { status = result.success ? 201 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur réclamation bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la réclamation.' });
  }
};
