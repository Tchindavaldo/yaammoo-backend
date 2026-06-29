const { getFastFoodsService } = require('../../services/fastfood/getFastFoods');
const { formatFastfoodsForClient } = require('../../utils/deliveryHoursFormat');

exports.getfastfoodController = async (req, res) => {
  try {
    const fastfoods = await getFastFoodsService();
    const data = formatFastfoodsForClient(fastfoods, req);
    return res.status(200).json({ success: true, message: 'fastfoods récupérées avec succès.', data, appleReviewMode: process.env.APPLE_REVIEW_MODE === 'true' });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des fastfood.',
    });
  }
};
