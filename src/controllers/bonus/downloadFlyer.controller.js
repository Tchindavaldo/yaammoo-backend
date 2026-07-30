const { downloadFlyerService } = require('../../services/bonus/downloadFlyer.service');

exports.downloadFlyerController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const bonusId = req.params.id;
    const result = await downloadFlyerService(userId, bonusId);
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur téléchargement flyer :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors du téléchargement du flyer.' });
  }
};
