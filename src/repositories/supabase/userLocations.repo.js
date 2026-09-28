// ============================================================================
// User Locations Repository — Supabase (migration 054)
// ============================================================================
// `user_locations` : historique des positions (une ligne par capture). Seule
// source de localisation : `users` n'en porte aucune colonne, la dernière
// position d'un user est sa ligne la plus récente.
// ============================================================================
const { supabase } = require('../../config/supabase');

const orNull = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOrNull = v => (Number.isFinite(v) ? v : null);

/**
 * Enregistre une capture.
 * @returns {Promise<boolean>} false si l'utilisateur n'existe pas.
 */
exports.record = async ({ id, userId, location, capturedAt }) => {
  const { data: user, error: eUser } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (eUser) throw eUser;
  if (!user) return false;

  const { error } = await supabase.from('user_locations').insert({
    id,
    user_id: userId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: numOrNull(location.accuracy),
    altitude: numOrNull(location.altitude),
    speed: numOrNull(location.speed),
    heading: numOrNull(location.heading),
    city: orNull(location.city),
    subregion: orNull(location.subregion),
    region: orNull(location.region),
    district: orNull(location.district),
    street: orNull(location.street),
    street_number: orNull(location.streetNumber),
    place_name: orNull(location.placeName),
    formatted_address: orNull(location.formattedAddress),
    postal_code: orNull(location.postalCode),
    country: orNull(location.country),
    iso_country_code: orNull(location.isoCountryCode),
    timezone: orNull(location.timezone),
    source: location.source,
    platform: orNull(location.platform),
    captured_at: capturedAt,
  });
  if (error) throw error;
  return true;
};

/**
 * Dernière position connue d'un user (capture la plus récente), ou null.
 * Lecture de l'index `idx_user_locations_user`.
 * @returns {Promise<{latitude:number, longitude:number, capturedAt:string}|null>}
 */
exports.getLatest = async userId => {
  const { data, error } = await supabase
    .from('user_locations')
    .select('latitude, longitude, captured_at')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { latitude: data.latitude, longitude: data.longitude, capturedAt: data.captured_at } : null;
};
