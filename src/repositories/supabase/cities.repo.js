// Repository cities (migration 095) : villes de livraison proposees aux boutiques.
// Utilise par services/cities/cities.service.js.
const { supabase } = require('../../config/supabase');

const TABLE = 'cities';
const fromRow = r => (r ? { id: r.id, name: r.name, region: r.region, active: r.active } : null);

/** Villes, actives seulement par defaut, triees par nom. */
exports.list = async ({ includeInactive = false } = {}) => {
  let q = supabase.from(TABLE).select('*').order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(fromRow);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

exports.update = async (id, patch) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
};
