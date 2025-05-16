const { getBonusRequestStatus } = require('../../services/bonusRequest/getBonusRequestStatus.service');

exports.getBonusRequestStatusController = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalBonus } = req.body;
    if (!id || !totalBonus) return res.status(400).json({ message: 'parametre manquant' });

    const response = await getBonusRequestStatus(id, totalBonus);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
