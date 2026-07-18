const { getBonusService } = require('../../services/bonus/getBonus.service');

exports.getBonusController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const bonus = await getBonusService(userId);
    return res.status(200).json({ success: true, message: 'bonus récupérées avec succès.', data: bonus });
  } catch (error) {
    console.error('Erreur récupération bonus :', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des bonus.',
    });
  }
};
