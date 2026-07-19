const { postBonusService } = require('../../services/bonus/postBonus.service');

exports.postBonusController = async (req, res) => {
  try {
    const result = await postBonusService(req.body);
    const { status = result.success ? 201 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur création bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la création du bonus.' });
  }
};
