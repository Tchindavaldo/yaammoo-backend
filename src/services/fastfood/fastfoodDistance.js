// ============================================================================
// fastfoodDistance — distance entre l'utilisateur et chaque boutique du home
// ============================================================================
// Origine, par priorité :
//   1. `lat` / `lng` de la requête (position fraîche envoyée par l'app) ;
//   2. dernière position connue du user connecté (`user_locations`).
// Destination : position de la boutique (`fastfoods.latitude/longitude`,
// migration 060), posée par le marchand. Jamais la position personnelle du
// propriétaire : elle trahirait son domicile et serait fausse hors boutique.
//
// `distanceKm` (1 décimale) vaut null quand l'une des deux positions manque.
// Champ ajouté : les anciennes apps l'ignorent (R11 ne s'applique pas).
// ============================================================================
const repos = require('../../repositories');
const { haversineKm, isValidPoint } = require('../../utils/geo');

/** Position fournie en query (`?lat=&lng=`), ou null. */
const originFromQuery = query => {
  const point = { latitude: parseFloat(query?.lat), longitude: parseFloat(query?.lng) };
  return isValidPoint(point) ? point : null;
};

/**
 * @param {Object[]} fastfoods boutiques déjà enrichies par le service
 * @param {Object} ctx
 * @param {string} [ctx.userId] uid du user courant (auth facultative)
 * @param {Object} [ctx.query] query string (`lat`, `lng`)
 * @returns {Promise<Object[]>} mêmes boutiques, avec `distanceKm`
 */
exports.withDistances = async (fastfoods, { userId, query } = {}) => {
  if (!Array.isArray(fastfoods) || fastfoods.length === 0) return fastfoods;

  let origin = originFromQuery(query);
  if (!origin && userId) {
    // Une position introuvable ne doit jamais faire échouer le home.
    origin = await repos.userLocations.getLatest(userId).catch(err => {
      console.error('Distance home : position du user illisible :', err.message);
      return null;
    });
  }

  return fastfoods.map(f => {
    const shop = { latitude: f.latitude, longitude: f.longitude };
    const distanceKm = origin && isValidPoint(shop) ? Math.round(haversineKm(origin, shop) * 10) / 10 : null;
    return { ...f, distanceKm };
  });
};
