const { getBonusService } = require('../../services/bonus/getBonus.service');

exports.getBonusController = async (req, res) => {
  try {
    const bonus = await getBonusService();
    return res.status(200).json({ success: true, message: 'bonus récupérées avec succès.', data: bonus });
  } catch (error) {
    console.error('Erreur récupération bonus :', error);
    return res.status(error.message === 'bonus non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des bonus.',
    });
  }
};
