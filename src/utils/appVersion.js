// ============================================================================
// appVersion — Primitives GÉNÉRIQUES de version d'app (pures, sans config)
// ----------------------------------------------------------------------------
// Les versions de référence (repli sans header, seuil de chaque feature) sont
// en BASE (`settings_deployment`, migration 066) : voir
// `settings.service` › `clientVersionOf` / `clientSupportsFeature`.
// Voir CLAUDE.md › R11.
// ============================================================================

// Compare deux versions sémantiques "x.y.z". Retourne >0 si a>b, <0 si a<b, 0 si égal.
const compareVersions = (a, b) => {
  const pa = String(a)
    .split('.')
    .map(n => parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

// Version du header `x-app-version`, sinon `fallback` (lu en base par l'appelant).
const resolveClientVersion = (req, fallback) => {
  const headerVersion = req && req.headers && req.headers['x-app-version'];
  return headerVersion || fallback;
};

module.exports = { compareVersions, resolveClientVersion };
