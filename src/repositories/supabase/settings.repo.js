// ============================================================================
// Settings Repository — Supabase
// ============================================================================
// Réglages métier clé/valeur (migration 019). `value` est du JSONB : le type
// natif (nombre, booléen, objet) traverse sans conversion.
// ============================================================================
const { supabase } = require('../../config/supabase');

const TABLE = 'settings';

/** Tous les réglages, sous forme de map `{ key: value }`. */
exports.getAll = async () => {
  const { data, error } = await supabase.from(TABLE).select('key, value');
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
};

exports.get = async key => {
  const { data, error } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : undefined;
};

/** Crée ou remplace un réglage. */
exports.set = async (key, value, description) => {
  const payload = { key, value, updated_at: new Date().toISOString() };
  if (description !== undefined) payload.description = description;

  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return { key: data.key, value: data.value, description: data.description, updatedAt: data.updated_at };
};

/** Détail complet (avec description) — pour l'écran d'administration. */
exports.listDetailed = async () => {
  const { data, error } = await supabase.from(TABLE).select('*').order('key');
  if (error) throw error;
  return (data || []).map(r => ({ key: r.key, value: r.value, description: r.description, updatedAt: r.updated_at }));
};
