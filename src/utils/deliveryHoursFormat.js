// ============================================================================
// deliveryHoursFormat — Compatibilité ascendante des créneaux de livraison
// ----------------------------------------------------------------------------
// Deux formats de `deliveryHours` coexistent en base :
//   - legacy (app < 1.0.1) : ["10:00", "14:00"]                 (strings)
//   - new    (app >= 1.0.1) : [{ hour: "13:06", express, ... }]  (objets enrichis)
//
// L'app legacy plante si on lui sert des objets (hour.split is not a function).
// On "downgrade" donc le nouveau format vers l'ancien selon la version du client.
// La détection de version est déléguée à `appVersion.js` (logique générique).
// ============================================================================
const { clientVersionAtLeast } = require('./appVersion');

// Version d'app minimale comprenant le nouveau format deliveryHours (objets).
const NEW_FORMAT_MIN_VERSION = process.env.APP_DELIVERY_NEW_MIN_VERSION || '1.0.1';

// Vrai si le client appelant supporte le format deliveryHours enrichi (objets).
const clientSupportsNewDeliveryFormat = (req) => clientVersionAtLeast(req, NEW_FORMAT_MIN_VERSION);

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
  if (clientSupportsNewDeliveryFormat(req)) return fastfoods;
  return (fastfoods || []).map((f) => applyDeliveryFormatToFastfood(f, false));
};

module.exports = {
  clientSupportsNewDeliveryFormat,
  toLegacyDeliveryHours,
  applyDeliveryFormatToFastfood,
  formatFastfoodsForClient,
};
