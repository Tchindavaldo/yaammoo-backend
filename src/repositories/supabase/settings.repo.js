// ============================================================================
// Settings Repository — Supabase
// ============================================================================
// Réglages métier clé/valeur, répartis en CINQ tables par catégorie
// (migration 046) : `settings_auth`, `settings_pricing`, `settings_delivery`,
// `settings_withdrawal`, `settings_deployment`.
//
// Toutes ont la même forme (key / value JSONB / description / updated_at) :
// seule la table change. `value` est du JSONB, le type natif (nombre, booléen,
// chaîne, objet) traverse sans conversion.
//
// La catégorie n'est jamais devinée depuis la clé : elle est déclarée dans
// `KEY_CATEGORY` (settings.service) et transmise ici. Une clé mal rangée est
// ainsi une erreur explicite, pas une écriture silencieuse dans la mauvaise
// table.
// ============================================================================
const { supabase } = require('../../config/supabase');

/** Catégories connues → table Supabase correspondante. */
const TABLES = {
  auth: 'settings_auth',
  pricing: 'settings_pricing',
  delivery: 'settings_delivery',
  withdrawal: 'settings_withdrawal',
  deployment: 'settings_deployment',
};

exports.CATEGORIES = Object.keys(TABLES);

const tableFor = category => {
  const table = TABLES[category];
  if (!table) {
    throw new Error(`settings: catégorie inconnue "${category}" (attendu : ${exports.CATEGORIES.join(', ')})`);
  }
  return table;
};

/**
 * Tous les réglages de TOUTES les catégories, en une map `{ key: value }`.
 *
 * Les clés sont uniques d'une table à l'autre (une clé appartient à une seule
 * catégorie), la map à plat reste donc sans ambiguïté — c'est ce que consomme
 * le cache du service.
 *
 * Les tables sont lues en parallèle : elles sont indépendantes, et cette
 * lecture est sur le chemin de l'affichage du home.
 */
exports.getAll = async () => {
  const results = await Promise.all(
    exports.CATEGORIES.map(async category => {
      const { data, error } = await supabase.from(tableFor(category)).select('key, value');
      if (error) throw error;
      return data || [];
    })
  );

  const map = {};
  for (const rows of results) {
    for (const row of rows) map[row.key] = row.value;
  }
  return map;
};

/** Réglages d'UNE catégorie, en map `{ key: value }`. */
exports.getCategory = async category => {
  const { data, error } = await supabase.from(tableFor(category)).select('key, value');
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
};

exports.get = async (category, key) => {
  const { data, error } = await supabase.from(tableFor(category)).select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : undefined;
};

/** Crée ou remplace un réglage dans la table de sa catégorie. */
exports.set = async (category, key, value, description) => {
  const payload = { key, value, updated_at: new Date().toISOString() };
  if (description !== undefined) payload.description = description;

  const { data, error } = await supabase.from(tableFor(category)).upsert(payload, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return { category, key: data.key, value: data.value, description: data.description, updatedAt: data.updated_at };
};

/**
 * Détail complet, groupé par catégorie — pour l'écran d'administration.
 * @returns {Promise<Record<string, Array<{key, value, description, updatedAt}>>>}
 */
exports.listDetailed = async () => {
  const entries = await Promise.all(
    exports.CATEGORIES.map(async category => {
      const { data, error } = await supabase.from(tableFor(category)).select('*').order('key');
      if (error) throw error;
      const rows = (data || []).map(r => ({
        key: r.key,
        value: r.value,
        description: r.description,
        updatedAt: r.updated_at,
      }));
      return [category, rows];
    })
  );

  return Object.fromEntries(entries);
};
