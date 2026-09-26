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
  altitude: { type: 'number', required: false, min: -1000, max: 10000 },
  // m/s ; une vitesse inconnue (-1 sur iOS) est envoyée absente par l'app.
  speed: { type: 'number', required: false, min: 0 },
  heading: { type: 'number', required: false, min: 0, max: 360 },
  city: text,
  // Département au Cameroun.
  subregion: text,
  region: text,
  // Quartier / arrondissement.
  district: text,
  street: text,
  streetNumber: { type: 'string', required: false, maxLength: 20 },
  // Nom du lieu (bâtiment, repère) donné par le géocodeur.
  placeName: text,
  // Adresse complète (Android uniquement).
  formattedAddress: { type: 'string', required: false, maxLength: 300 },
  postalCode: text,
  country: text,
  isoCountryCode: { type: 'string', required: false, maxLength: 3 },
  // Fuseau du lieu, ex. Africa/Douala (iOS uniquement).
  timezone: { type: 'string', required: false, maxLength: 64 },
  source: { type: 'string', required: true, allowedValues: exports.USER_LOCATION_SOURCES },
  platform: { type: 'string', required: false, allowedValues: ['ios', 'android', 'web'] },
  // Heure de capture côté téléphone (ISO 8601). Absente = heure de réception.
  capturedAt: { type: 'string', required: false, maxLength: 40 },
};
