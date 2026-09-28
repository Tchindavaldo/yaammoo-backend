// ============================================================================
// Driver Positions Repository — Supabase (migration 060)
// ============================================================================
// `driver_positions` : DERNIÈRE position de chaque livreur en course, une ligne
// par livreur, écrasée à chaque envoi. Aucun historique ici.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'driver_positions';
const numOrNull = v => (Number.isFinite(v) ? v : null);

const fromRow = row =>
  row && {
    driverId: row.driver_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    speed: row.speed,
    heading: row.heading,
    capturedAt: row.captured_at,
  };

/** Écrase la position du livreur. */
exports.upsert = async ({ driverId, latitude, longitude, accuracy, speed, heading, capturedAt }) => {
  const { error } = await supabase.from(TABLE).upsert(
    {
      driver_id: driverId,
      latitude,
      longitude,
      accuracy: numOrNull(accuracy),
      speed: numOrNull(speed),
      heading: numOrNull(heading),
      captured_at: capturedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id' }
  );
  if (error) throw error;
};

/** Dernière position du livreur, ou null. */
exports.getByDriver = async driverId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('driver_id', driverId).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};
