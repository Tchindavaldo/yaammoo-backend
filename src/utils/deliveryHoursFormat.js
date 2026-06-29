// ============================================================================
// deliveryHoursFormat — Compatibilité ascendante des créneaux de livraison
// ----------------------------------------------------------------------------
// Deux formats de `deliveryHours` coexistent en base :
//   - legacy (app 1.0.0) : ["10:00", "14:00"]                 (strings)
//   - new    (app 1.0.1) : [{ hour: "13:06", express, ... }]  (objets enrichis)
//
// L'app 1.0.0 plante si on lui sert des objets (hour.split is not a function).
// On "downgrade" donc le nouveau format vers l'ancien selon le client appelant.
//
// Détection de la version du client appelant :
//   1. Header `x-app-version` (prioritaire) → version du client réel.
//   2. Variable d'env `FRONTEND_APP_VERSION` (fallback si aucun header).
// Cette version est comparée à NEW_FORMAT_MIN_VERSION pour choisir le format.
// `FRONTEND_APP_VERSION` est volontairement générique : réutilisable pour tout
// futur endpoint devant adapter sa réponse selon la version de l'app.
// ============================================================================

// Version à partir de laquelle l'app comprend le nouveau format (objets).
const NEW_FORMAT_MIN_VERSION = process.env.APP_DELIVERY_NEW_MIN_VERSION || '1.0.1';

// Version d'app par défaut quand aucun header n'est émis (vieux clients, curl, outils).
const DEFAULT_APP_VERSION = process.env.FRONTEND_APP_VERSION || '1.0.0';

// Compare deux versions sémantiques "x.y.z". Retourne >=0 si a >= b.
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

// Détermine si le client appelant supporte le nouveau format (objets).
const clientSupportsNewFormat = (req) => {
  return compareVersions(resolveClientVersion(req), NEW_FORMAT_MIN_VERSION) >= 0;
};

// Convertit un tableau deliveryHours vers le format legacy (strings "HH:mm").
// - une string reste telle quelle
// - un objet { hour, ... } est réduit à sa string `hour`
const toLegacyDeliveryHours = (deliveryHours) => {
  if (!Array.isArray(deliveryHours)) return [];
  return deliveryHours
    .map((h) => {
      if (typeof h === 'string') return h;
      if (h && typeof h === 'object' && typeof h.hour === 'string') return h.hour;
      return null;
    })
    .filter((h) => typeof h === 'string');
};

// Applique le bon format de deliveryHours à un objet fastfood (immuable).
const applyDeliveryFormatToFastfood = (fastfood, newFormat) => {
  if (!fastfood) return fastfood;
  if (newFormat) return fastfood; // nouveau client → on laisse le format enrichi
  return { ...fastfood, deliveryHours: toLegacyDeliveryHours(fastfood.deliveryHours) };
};

// Applique le format à une liste de fastfoods selon la requête entrante.
const formatFastfoodsForClient = (fastfoods, req) => {
  const newFormat = clientSupportsNewFormat(req);
  if (newFormat) return fastfoods;
  return (fastfoods || []).map((f) => applyDeliveryFormatToFastfood(f, false));
};

module.exports = {
  resolveClientVersion,
  clientSupportsNewFormat,
  toLegacyDeliveryHours,
  applyDeliveryFormatToFastfood,
  formatFastfoodsForClient,
};
