// ============================================================================
// Champs de POST /driver/location (migration 060)
// ============================================================================
// Position du livreur en course, envoyée par la tâche arrière-plan de l'app en
// mode « livraison » (~10 s). Le livreur est celui du Bearer, jamais un champ
// du corps. Voir architecture/geolocation.md.

exports.driverLocationFields = {
  latitude: { type: 'number', required: true, min: -90, max: 90 },
  longitude: { type: 'number', required: true, min: -180, max: 180 },
  // Rayon d'incertitude (m).
  accuracy: { type: 'number', required: false, min: 0 },
  // m/s ; une vitesse inconnue (-1 sur iOS) est envoyée absente par l'app.
  speed: { type: 'number', required: false, min: 0 },
  // Degrés, 0 = nord ; inconnu (-1 sur iOS) envoyé absent.
  heading: { type: 'number', required: false, min: 0, max: 360 },
  // Heure de capture côté téléphone (ISO 8601). Absente = heure de réception.
  capturedAt: { type: 'string', required: false, maxLength: 40 },
};
