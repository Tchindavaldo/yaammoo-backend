// ============================================================================
// appVersion — Détection GÉNÉRIQUE de la version de l'app cliente
// ----------------------------------------------------------------------------
// Logique transverse, réutilisable par TOUT endpoint devant adapter sa réponse
// selon la version de l'app (compatibilité ascendante des données frontend).
// Voir CLAUDE.md › "Versioning par version d'app".
//
// Résolution de la version du client :
//   1. Header `x-app-version` (prioritaire) → version réelle du client.
//   2. Variable d'env `FRONTEND_APP_VERSION` (fallback si aucun header).
// ============================================================================

// Version d'app supposée quand aucun header n'est émis (vieux clients, curl, outils).
const DEFAULT_APP_VERSION = process.env.FRONTEND_APP_VERSION || '1.0.0';

// Compare deux versions sémantiques "x.y.z". Retourne >0 si a>b, <0 si a<b, 0 si égal.
const compareVersions = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

// Résout la version d'app du client : header prioritaire, sinon var d'env.
// `req` peut être absent (appel interne) → retombe sur DEFAULT_APP_VERSION.
const resolveClientVersion = (req) => {
  const headerVersion = req && req.headers && req.headers['x-app-version'];
  return headerVersion || DEFAULT_APP_VERSION;
};

// Vrai si la version du client est >= minVersion. Primitive de base à utiliser
// dans les endpoints pour décider quel format de données renvoyer.
const clientVersionAtLeast = (req, minVersion) => {
  return compareVersions(resolveClientVersion(req), minVersion) >= 0;
};

module.exports = {
  compareVersions,
  resolveClientVersion,
  clientVersionAtLeast,
};
