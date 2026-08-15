// ============================================================================
// Banners Repository — Supabase
// ============================================================================
// Table `banners` (migration 044). Tri rigoureux par `sort_order` : le service
// maintient une séquence 0..n-1 sans doublon (cf. services/banners).
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'banners';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.banner.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.banner.fromSupabase(row);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.banner.fromSupabase(data);
};

/** Tous les banners, par ordre d'affichage. */
exports.getAll = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(m.banner.fromSupabase);
};

/** Banners actifs uniquement (ceux servis au home). */
exports.getActive = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(m.banner.fromSupabase);
};

exports.update = async (id, fields) => {
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Banner ${id} introuvable`);
  const merged = { ...existing, ...fields };
  const payload = m.banner.toSupabase({
    ...merged,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return m.banner.fromSupabase(data);
};

/**
 * Applique la nouvelle séquence d'ordre (0..n-1) à TOUS les banners.
 * @param {Array<{id: string, sortOrder: number}>} orderList
 */
exports.applyOrder = async orderList => {
  // Une seule requête de mise à jour par droit : on remet à plat sans conflit.
  for (const item of orderList || []) {
    await exports.update(item.id, { sortOrder: item.sortOrder });
  }
};

exports.remove = async id => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};
