// ============================================================================
// adminGuard — Réserve une route aux administrateurs
// ============================================================================
// À placer APRÈS `firebaseAuth`, qui pose `req.user.uid`. Le rôle n'est pas lu
// depuis le token : `isAdmin` vit en base, donc retirer les droits à quelqu'un
// prend effet immédiatement, sans attendre l'expiration de son jeton.
// ============================================================================

const repos = require('../repositories');

module.exports = async function adminGuard(req, res, next) {
  try {
    const viewer = await repos.users.getUserByIdSafe(req.user?.uid);
    if (!viewer) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
    if (!viewer.isAdmin) return res.status(403).json({ success: false, message: 'Réservé aux administrateurs.' });

    req.viewer = viewer;
    return next();
  } catch (error) {
    console.error('adminGuard:', error.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};
