// ============================================================================
// Bonus Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'bonus';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.bonus.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.bonus.fromSupabase(row);
};

/**
 * @param {Object} [filters]
 * @param {string} [filters.fastFoodId]  bonus d'une boutique donnée
 * @param {boolean} [filters.active]     bonus actifs uniquement
 * @param {boolean} [filters.includePlatform] avec fastFoodId : inclut aussi les
 *                                            bonus plateforme (sans fastfood_id)
 */
exports.getAll = async ({ fastFoodId, active, includePlatform } = {}) => {
  // Filtrage en SQL (colonnes réelles + index depuis la migration 014).
  let q = supabase.from(TABLE).select('*');

  if (fastFoodId) {
    q = includePlatform ? q.or(`fastfood_id.eq.${fastFoodId},fastfood_id.is.null`) : q.eq('fastfood_id', fastFoodId);
  }
  if (active !== undefined) q = q.eq('active', active);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(m.bonus.fromSupabase);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.bonus.fromSupabase(data);
};

/**
 * Mise à jour partielle : seuls les champs fournis sont écrits.
 * @param {string} id
 * @param {Object} fields champs (camelCase) à modifier
 */
exports.update = async (id, fields) => {
  const existing = await exports.getById(id);
  if (!existing) return null;

  // On repasse par le mapper pour la conversion camelCase -> snake_case, en ne
  // conservant que les colonnes réellement concernées par la mise à jour.
  const full = m.bonus.toSupabase({ ...existing, ...fields, id });
  const payload = {};
  const TOUCHABLE = {
    type: 'type',
    name: 'name',
    description: 'description',
    criteria: 'criteria',
    fastFoodId: 'fastfood_id',
    fastFoodName: 'fastfood_name',
    active: 'active',
    claimDuration: 'claim_duration',
    usageLimit: 'usage_limit',
  };
  for (const key of Object.keys(fields)) {
    const column = TOUCHABLE[key];
    if (column) payload[column] = full[column];
  }
  if (Object.keys(payload).length === 0) return existing;

  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return m.bonus.fromSupabase(data);
};
