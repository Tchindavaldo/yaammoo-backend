const { getFastFoodsService } = require('../../services/fastfood/getFastFoods');
const { getActiveBanners } = require('../../services/banners/banners.service');
const { withBannerThumbnail } = require('../../services/images/thumbnailUrl');
const { formatFastfoodsForClient } = require('../../utils/deliveryHoursFormat');
const { getAppleReviewMode } = require('../../services/settings/settings.service');

/** Borne la taille de page : un `?limit=5000` annulerait tout l'intérêt. */
const MAX_LIMIT = 50;

exports.getfastfoodController = async (req, res) => {
  try {
    // Pagination OPT-IN : sans `?limit`, la route renvoie tout le catalogue
    // comme avant. Les apps déjà installées ne connaissent pas ces paramètres
    // et doivent continuer de fonctionner à l'identique.
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : null;
    const cursor = req.query.cursor || undefined;
    const q = req.query.q || undefined;

    // Auth facultative : sans token la route reste servie, simplement sans
    // `deliveryOffer` (on ne sait pas de quel user il s'agit).
    const result = await getFastFoodsService(req.user?.uid, limit ? { limit, cursor, q } : undefined);
    const paginated = limit !== null;
    const fastfoods = paginated ? result.items : result;
    const data = formatFastfoodsForClient(fastfoods, req);
    const appleReviewMode = await getAppleReviewMode();

    // Bannières : uniquement sur la PREMIÈRE page. Les renvoyer à chaque
    // `loadMore` serait du poids pur — le carrousel ne se recharge pas au
    // scroll. `cursor` absent = première page (ou mode non paginé).
    const banners = cursor
      ? []
      : (
          await getActiveBanners().catch(err => {
            console.error('Erreur lecture bannières (fallback vide):', err.message);
            return [];
          })
        ).map(withBannerThumbnail); // WebP : ~600 Ko -> ~90 Ko par bannière

    return res.status(200).json({
      success: true,
      message: 'fastfoods récupérées avec succès.',
      data,
      banners,
      appleReviewMode,
      // Présent uniquement en mode paginé : null signifie « fin de liste ».
      ...(paginated ? { nextCursor: result.nextCursor } : {}),
    });
  } catch (error) {
    console.error('Erreur récupération fastfood :', error);
    return res.status(error.message === 'Fastfood non trouvé' ? 404 : 500).json({
      success: false,
      message: error.message || 'Erreur serveur lors de la récupération des fastfood.',
    });
  }
};
