const { getFastFoodsService } = require('../../services/fastfood/getFastFoods');
const { getActiveBanners } = require('../../services/banners/banners.service');
const { withBannerThumbnail } = require('../../services/images/thumbnailUrl');
const { formatFastfoodsForClient } = require('../../utils/deliveryHoursFormat');
const { getAppleReviewMode } = require('../../services/settings/settings.service');

exports.getfastfoodController = async (req, res) => {
  try {
    // Auth facultative : sans token la route reste servie, simplement sans
    // `deliveryOffer` (on ne sait pas de quel user il s'agit).
    const fastfoods = await getFastFoodsService(req.user?.uid);
    const data = formatFastfoodsForClient(fastfoods, req);
    const appleReviewMode = await getAppleReviewMode();
    // Bannières publicitaires ACTIVES, pour le carrousel du home. Serties ici
    // pour que le home n'ait qu'un seul appel à faire. Lecture jamais bloquante.
    const banners = (
      await getActiveBanners().catch(err => {
        console.error('Erreur lecture bannières (fallback vide):', err.message);
        return [];
      })
    ).map(withBannerThumbnail); // WebP : ~600 Ko -> ~90 Ko par bannière
    return res.status(200).json({ success: true, message: 'fastfoods récupérées avec succès.', data, banners, appleReviewMode });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des fastfood.',
    });
  }
};
