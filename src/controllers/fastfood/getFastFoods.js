const { getFastFoodsService } = require('../../services/fastfood/getFastFoods');

exports.getfastfoodController = async (req, res) => {
  try {
    const fastfoods = await getFastFoodsService();
    return res.status(200).json({ success: true, message: 'fastfoods récupérées avec succès.', data: fastfoods });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des fastfood.',
    });
  }
};
