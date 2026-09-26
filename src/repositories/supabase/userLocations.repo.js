// ============================================================================
// User Locations Repository — Supabase (migration 054)
// ============================================================================
// `user_locations` : historique des positions (une ligne par capture).
// `users.location_*` : dernière position connue, recopiée à chaque capture.
// ============================================================================
const { supabase } = require('../../config/supabase');

const orNull = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Enregistre une capture et met à jour la dernière position de l'utilisateur.
 * @returns {Promise<boolean>} false si l'utilisateur n'existe pas.
 */
exports.record = async ({ id, userId, location, capturedAt }) => {
  const { data: user, error: eUser } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (eUser) throw eUser;
  if (!user) return false;

  const { error: eInsert } = await supabase.from('user_locations').insert({
    id,
    user_id: userId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    city: orNull(location.city),
    subregion: orNull(location.subregion),
    region: orNull(location.region),
    district: orNull(location.district),
    street: orNull(location.street),
    postal_code: orNull(location.postalCode),
    country: orNull(location.country),
    iso_country_code: orNull(location.isoCountryCode),
    source: location.source,
    platform: orNull(location.platform),
    captured_at: capturedAt,
  });
  if (eInsert) throw eInsert;

  // Les champs de lieu ne sont remplacés que s'ils sont connus : un géocodage
  // inverse raté (hors ligne) ne doit pas effacer la ville déjà trouvée.
  const latest = {
    location_lat: location.latitude,
    location_lng: location.longitude,
    location_updated_at: capturedAt,
  };
  const place = {
    location_city: orNull(location.city),
    location_subregion: orNull(location.subregion),
    location_region: orNull(location.region),
    location_district: orNull(location.district),
    location_country: orNull(location.country),
  };
  for (const [col, value] of Object.entries(place)) if (value) latest[col] = value;

  const { error: eUpdate } = await supabase.from('users').update(latest).eq('id', userId);
  if (eUpdate) throw eUpdate;
  return true;
};
