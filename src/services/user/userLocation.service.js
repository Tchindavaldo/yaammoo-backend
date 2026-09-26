// ============================================================================
// userLocationService — Position de l'utilisateur (migration 054)
// ============================================================================
// Chaque capture est AJOUTÉE à l'historique `user_locations` (jamais
// dédoublonnée : la suite des positions sert au suivi). Rien n'est écrit sur
// `users`.
// ============================================================================
const repos = require('../../repositories');
const { generateId } = require('../../repositories/idGen');

/** Heure du téléphone acceptée si elle reste plausible, sinon heure serveur. */
const MAX_PAST_MS = 7 * 86400000;
const MAX_FUTURE_MS = 5 * 60000;

const resolveCapturedAt = raw => {
  const now = Date.now();
  const t = raw ? new Date(raw).getTime() : NaN;
  if (Number.isFinite(t) && t >= now - MAX_PAST_MS && t <= now + MAX_FUTURE_MS) {
    return new Date(t).toISOString();
  }
  return new Date(now).toISOString();
};

/**
 * @param {string} userId  uid du Bearer
 * @param {object} location payload validé (`validateUserLocation`)
 */
exports.recordUserLocation = async (userId, location) => {
  const saved = await repos.userLocations.record({
    id: generateId(),
    userId,
    location,
    capturedAt: resolveCapturedAt(location.capturedAt),
  });
  if (!saved) return { status: 404, message: 'Utilisateur non trouvé.' };
  return { status: 201, data: { city: location.city || null } };
};
