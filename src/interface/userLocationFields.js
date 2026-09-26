// ============================================================================
// Champs de POST /user/location (migration 054)
// ============================================================================
// Position capturée par l'app + résultat du géocodage inverse du téléphone
// (`expo-location` → `reverseGeocodeAsync`). L'utilisateur est celui du Bearer,
// jamais un champ du corps. Voir architecture/user-location.md.

exports.USER_LOCATION_SOURCES = ['login', 'app_open', 'foreground', 'background'];

const text = { type: 'string', required: false, maxLength: 120 };

exports.userLocationFields = {
  latitude: { type: 'number', required: true, min: -90, max: 90 },
  longitude: { type: 'number', required: true, min: -180, max: 180 },
  accuracy: { type: 'number', required: false, min: 0 },
  city: text,
  // Département au Cameroun.
  subregion: text,
  region: text,
  // Quartier / arrondissement.
  district: text,
  street: text,
  postalCode: text,
  country: text,
  isoCountryCode: { type: 'string', required: false, maxLength: 3 },
  source: { type: 'string', required: true, allowedValues: exports.USER_LOCATION_SOURCES },
  platform: { type: 'string', required: false, allowedValues: ['ios', 'android', 'web'] },
  // Heure de capture côté téléphone (ISO 8601). Absente = heure de réception.
  capturedAt: { type: 'string', required: false, maxLength: 40 },
};
