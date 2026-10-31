// src/middlewares/firebaseAuth.js
const { admin } = require('../config/firebase');
const { isNoAuthToleratedClient } = require('../services/settings/settings.service');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Versions listées dans `test_no_auth_versions` (settings_test) : tolérées
  // sans jeton (`req.legacyNoAuth` : `authorize` ne contrôle rien).
  // ⚠️ Le header se falsifie : vider ce tableau dès que possible.
  if (!authHeader && (await isNoAuthToleratedClient(req))) {
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
