const { claimBonusService } = require('../../services/bonus/claimBonus.service');

exports.claimBonusController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const bonusId = req.params.id;
    const result = await claimBonusService(userId, bonusId);
    const { status = result.success ? 201 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur réclamation bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la réclamation.' });
  }
};
