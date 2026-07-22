// ============================================================================
// optionalFirebaseAuth — Authentification FACULTATIVE
// ============================================================================
// Pour les routes publiques dont la réponse s'enrichit quand l'appelant est
// connu (ex. GET /fastfood/all → offres de livraison du user courant).
//
// Token valide   → req.user renseigné, comme firebaseAuth.
// Token absent   → on passe, req.user reste undefined.
// Token invalide → on passe AUSSI : la route est publique, un token périmé ne
//                  doit pas priver l'appelant du contenu de base.
// ============================================================================
const { admin } = require('../config/firebase');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    req.user = await admin.auth().verifyIdToken(authHeader.split(' ')[1]);
  } catch (error) {
    // Volontairement silencieux au niveau HTTP : la route reste servie.
    console.warn('optionalFirebaseAuth: token ignoré —', error.message);
  }
  return next();
};
