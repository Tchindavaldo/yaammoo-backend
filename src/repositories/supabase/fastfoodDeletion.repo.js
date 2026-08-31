// ============================================================================
// FastfoodDeletion Repository — Supabase
// ============================================================================
// Suppression ADMIN d'une boutique, en SOFT DELETE (migration 047).
//
// Séparé de `fastfoods.repo.js` volontairement : celui-ci porte les lectures et
// écritures du quotidien (home, édition boutique), appelées à chaque requête.
// La suppression est une opération d'administration rare et destructrice — la
// garder à part évite qu'un `repos.fastfoods.*` autocomplété ne la déclenche par
// accident, et laisse chaque fichier sous le plafond de taille (R3).
// ============================================================================

const { supabase } = require('../../config/supabase');
const m = require('../mappers');

const TABLE = 'fastfoods';

/**
 * Marque une boutique et ses dépendances comme supprimées.
 *
 * Tout se joue dans la fonction SQL `soft_delete_fastfood` : marquer sept
 * tables depuis Node prendrait autant d'allers-retours, dont chacun peut
 * échouer en laissant la suppression à moitié faite.
 *
 * @param {string}   fastFoodId
 * @param {string[]} scopes  Types de données emportés. JAMAIS de valeur par
 *                           défaut : l'appelant doit dire ce qu'il supprime.
 * @returns {Promise<{found: boolean, deletedAt?: string, counts?: Object}>}
 */
exports.softDelete = async (fastFoodId, scopes) => {
  const { data, error } = await supabase.rpc('soft_delete_fastfood', {
    p_fastfood_id: fastFoodId,
    p_scopes: scopes,
  });
  if (error) throw error;
  return data;
};

/**
 * Annule une suppression tant que la purge n'est pas passée.
 * @returns {Promise<{restored: boolean, reason?: string, deletedAt?: string}>}
 */
exports.restore = async fastFoodId => {
  const { data, error } = await supabase.rpc('restore_fastfood', {
    p_fastfood_id: fastFoodId,
  });
  if (error) throw error;
  return data;
};

/**
 * Efface définitivement les boutiques marquées depuis plus de `retentionDays`.
 *
 * ⚠️ Renvoie `imageUrls` : les fichiers du bucket ne sont PAS supprimés par la
 * fonction SQL (Postgres n'a pas accès au storage). C'est au service appelant
 * de les effacer.
 *
 * @returns {Promise<{purged: number, ids: string[], imageUrls: string[]}>}
 */
exports.purgeExpired = async (retentionDays = 30) => {
  const { data, error } = await supabase.rpc('purge_soft_deleted_fastfoods', {
    p_retention_days: retentionDays,
  });
  if (error) throw error;
  return data;
};

// ⚠️ Les objets renvoyés ci-dessous portent un `deletedAt` que le mapper ne
// connaît pas : le repasser tel quel à `fastfoods.update()` le rangerait dans
// `extra_data` (tout champ inconnu y atterrit). Ces objets sont faits pour être
// LUS (écrans d'administration), jamais réécrits.

/** Boutiques actuellement en corbeille (marquées, pas encore purgées). */
exports.listDeleted = async () => {
  const { data, error } = await supabase.from(TABLE).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    ...m.fastfood.fromSupabase(row),
    deletedAt: row.deleted_at,
  }));
};

/**
 * Lit une boutique SANS filtrer les supprimées.
 * Sert aux écrans d'administration (corbeille, restauration), qui doivent voir
 * précisément ce que les lectures normales masquent.
 */
exports.getByIdIncludingDeleted = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...m.fastfood.fromSupabase(data), deletedAt: data.deleted_at };
};

/**
 * URL des images d'une boutique et de ses menus, pour nettoyer le bucket.
 * Inclut les lignes supprimées : c'est justement au moment de la purge qu'on
 * en a besoin.
 */
exports.collectImageUrls = async fastFoodId => {
  const [shop, menus] = await Promise.all([supabase.from(TABLE).select('image').eq('id', fastFoodId).maybeSingle(), supabase.from('menus').select('image, cover_image, images').eq('fastfood_id', fastFoodId)]);
  if (shop.error) throw shop.error;
  if (menus.error) throw menus.error;

  const urls = new Set();
  const add = u => {
    if (typeof u === 'string' && u.trim()) urls.add(u.trim());
  };

  add(shop.data?.image);
  for (const row of menus.data || []) {
    add(row.image);
    add(row.cover_image);
    if (Array.isArray(row.images)) row.images.forEach(add);
  }
  return [...urls];
};
