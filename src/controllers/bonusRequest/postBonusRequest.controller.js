const { postBonuRequestsService } = require('../../services/bonusRequest/postBonusRequest.service');

exports.postBonusRequestController = async (req, res) => {
  try {
    const totalBonus = Number(req.params.totalBonus);
    const response = await postBonuRequestsService(req.body, totalBonus);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
