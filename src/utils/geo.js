// ============================================================================
// Géométrie — fonctions pures (distance à vol d'oiseau)
// ============================================================================

const EARTH_RADIUS_KM = 6371;
const toRad = deg => (deg * Math.PI) / 180;

/** Coordonnées exploitables : deux nombres dans les bornes. */
exports.isValidPoint = p =>
  !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

/**
 * Distance à vol d'oiseau (formule de haversine), en km.
 * @param {{latitude:number, longitude:number}} a
 * @param {{latitude:number, longitude:number}} b
 */
exports.haversineKm = (a, b) => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};
