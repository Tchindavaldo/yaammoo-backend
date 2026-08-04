const { getFastFoodsService } = require('../../services/fastfood/getFastFoods');
const { formatFastfoodsForClient } = require('../../utils/deliveryHoursFormat');
const { getAppleReviewMode } = require('../../services/settings/settings.service');

exports.getfastfoodController = async (req, res) => {
  try {
    // Auth facultative : sans token la route reste servie, simplement sans
    // `deliveryOffer` (on ne sait pas de quel user il s'agit).
    const fastfoods = await getFastFoodsService(req.user?.uid);
    const data = formatFastfoodsForClient(fastfoods, req);
    const appleReviewMode = await getAppleReviewMode();
    return res.status(200).json({ success: true, message: 'fastfoods récupérées avec succès.', data, appleReviewMode });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des fastfood.',
    });
  }
};
