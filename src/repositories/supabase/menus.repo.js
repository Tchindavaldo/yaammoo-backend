// ============================================================================
// Menus Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'menus';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.menu.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.menu.fromSupabase(row);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

/**
 * Lit le stock BRUT d'un menu (sans le mapping `?? 0` de fromSupabase).
 * Sert au pré-check stock avant un paiement.
 * @returns {Promise<{ exists: boolean, stock: number|null }>}
 *   stock === null → menu sans gestion de stock (illimité, cf. create_order_with_stock_check).
 */
exports.getRawStock = async id => {
  const { data, error } = await supabase.from(TABLE).select('stock').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return { exists: false, stock: null };
  return { exists: true, stock: data.stock };
};

exports.getByFastFood = async fastFoodId => {
  // Exclut les menus en corbeille (migration 047) : une boutique supprimée par
  // un admin ne doit plus exposer son catalogue, même avant la purge.
  const { data, error } = await supabase.from(TABLE).select('*').eq('fastfood_id', fastFoodId).is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.menu.fromSupabase);
};

/**
 * Nombre de plats DISPONIBLES (vivants, non `unavailable`, `disponibilite` non
 * false) par boutique : Map fastFoodId -> nombre. Lu par lots (limite 1000 de
 * PostgREST). Sert au minimum de plats du home (getFastFoods).
 */
exports.availableCountByFastFood = async () => {
  const counts = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('fastfood_id')
      .is('deleted_at', null)
      .or('status.is.null,status.neq.unavailable')
      .or('disponibilite.is.null,disponibilite.eq.true')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data || []) counts.set(row.fastfood_id, (counts.get(row.fastfood_id) || 0) + 1);
    if (!data || data.length < PAGE) break;
  }
  return counts;
};

exports.update = async (id, fields) => {
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Menu ${id} introuvable`);
  const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.menu.toSupabase(merged);
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

exports.updateStock = async (id, newStock) => {
  const { data, error } = await supabase.from(TABLE).update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return m.menu.fromSupabase(data);
};

exports.delete = async id => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};
