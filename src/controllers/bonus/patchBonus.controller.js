const { patchBonusService } = require('../../services/bonus/patchBonus.service');

exports.patchBonusController = async (req, res) => {
  try {
    const result = await patchBonusService(req.params.id, req.body, req.user?.uid);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur modification bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la modification du bonus.' });
  }
};
