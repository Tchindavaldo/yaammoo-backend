// ============================================================================
// fastfoodOwnerGuard — Réserve une route au PROPRIÉTAIRE de la boutique, ou à un admin
// ============================================================================
// À placer APRÈS `firebaseAuth`, qui pose `req.user.uid`.
//
// ⚠️ Avant ce garde, `POST /fastFood/:fastFoodId` n'avait AUCUNE authentification :
// n'importe qui, sans même être connecté, pouvait renommer une boutique, changer
// son numéro Mobile Money ou vider ses créneaux de livraison. Le contrôle
// n'existait nulle part — ni dans le controller, ni dans le service.
//
// L'admin plateforme passe toujours : il doit pouvoir corriger n'importe quelle
// boutique (numéro erroné, contenu abusif) sans être son propriétaire.
// ============================================================================

const repos = require('../repositories');

module.exports = async function fastfoodOwnerGuard(req, res, next) {
  try {
    const fastFoodId = req.params.fastFoodId || req.params.id;
    if (!fastFoodId) return res.status(400).json({ success: false, message: 'ID du fastfood requis.' });

    const viewer = await repos.users.getUserByIdSafe(req.user?.uid);
    if (!viewer) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });

    // L'admin plateforme n'a pas besoin d'être propriétaire : on ne lit même pas
    // la boutique, le service s'en chargera (et renverra 404 si elle n'existe pas).
    if (viewer.isAdmin) {
      req.viewer = viewer;
      return next();
    }

    const fastfood = await repos.fastfoods.getById(fastFoodId);
    if (!fastfood) return res.status(404).json({ success: false, message: "Cette boutique n'existe pas." });

    if (fastfood.userId !== viewer.id) {
      return res.status(403).json({ success: false, message: 'Cette boutique ne vous appartient pas.' });
    }

    req.viewer = viewer;
    req.fastfood = fastfood;
    return next();
  } catch (error) {
    console.error('fastfoodOwnerGuard:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};
