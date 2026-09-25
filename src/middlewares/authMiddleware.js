// src/middlewares/firebaseAuth.js
const { admin } = require('../config/firebase');
const { compareVersions, resolveClientVersion } = require('../utils/appVersion');

/**
 * Compatibilite R11 : `/order`, `/menu` et `/support` etaient publiques avant la
 * gestion des employes. Les apps <= LEGACY_NO_AUTH_MAX_VERSION n'y envoient pas
 * de Bearer : sans jeton, on les laisse passer comme avant (`req.legacyNoAuth`,
 * lu par `authorize`). Les autres routes protegees l'etaient deja : ces apps y
 * envoient leur jeton. A retirer quand ces versions ont disparu.
 */
const LEGACY_NO_AUTH_MAX_VERSION = '1.1.0';
const LEGACY_OPEN_ROUTES = ['/order', '/menu', '/support'];

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (
    !authHeader &&
    LEGACY_OPEN_ROUTES.includes(req.baseUrl) &&
    compareVersions(resolveClientVersion(req), LEGACY_NO_AUTH_MAX_VERSION) <= 0
  ) {
    req.legacyNoAuth = true;
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authorization header missing or malformed.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Invalid or expired token.',
    });
  }
};
