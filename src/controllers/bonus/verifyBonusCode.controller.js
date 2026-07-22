const { verifyBonusCodeService } = require('../../services/bonus/verifyBonusCode.service');

/** POST /bonus/verify — vérifie un code bonus. Lecture seule, aucune consommation. */
exports.verifyBonusCodeController = async (req, res) => {
  try {
    const { code, fastFoodId } = req.body || {};
    const result = await verifyBonusCodeService(code, fastFoodId);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur vérification code bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la vérification.' });
  }
};
