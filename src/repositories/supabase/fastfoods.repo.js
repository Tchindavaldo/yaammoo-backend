// ============================================================================
// Fastfoods Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'fastfoods';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.fastfood.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.fastfood.fromSupabase(row);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

exports.getAll = async () => {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data || []).map(m.fastfood.fromSupabase);
};

// ============================================================================
// Pagination par CURSEUR — home client
// ----------------------------------------------------------------------------
// ⚠️ Pourquoi un curseur et pas `?page=2` : avec un offset, créer une boutique
// décale toutes les suivantes. La page 2 renverrait alors un élément déjà
// affiché, ou pire, en SAUTERAIT un définitivement. Le curseur dit « ce qui
// suit CET élément-là » — une insertion ailleurs ne le perturbe pas.
//
// ⚠️ Le tri DOIT être déterministe, sinon deux appels de la même page peuvent
// renvoyer un ordre différent et le curseur perd son sens. `getAll()` n'avait
// aucun ORDER BY (ordre laissé à Postgres) : c'est corrigé ici.
//
// Tri retenu : `created_at DESC, id DESC`. Une nouvelle boutique arrive donc
// TOUJOURS en tête, jamais au milieu — rien ne se décale sous les yeux de
// l'utilisateur pendant qu'il lit. `id` départage les créations simultanées.
// ============================================================================

/** Sépare un curseur opaque en ses deux composantes de tri. */
const decodeCursor = cursor => {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null; // Curseur illisible : on repart du début plutôt que d'échouer.
  }
};

/** Curseur opaque pour la ligne donnée (le client ne doit pas l'interpréter). */
const encodeCursor = row => Buffer.from(`${row.created_at}|${row.id}`, 'utf8').toString('base64url');

/**
 * Une page de boutiques, triée et paginée par curseur.
 *
 * @param {Object}  opts
 * @param {number}  opts.limit  taille de page (défaut 10)
 * @param {string}  [opts.cursor] curseur renvoyé par l'appel précédent
 * @param {string}  [opts.q]    recherche par nom (insensible à la casse)
 * @returns {Promise<{items: Object[], nextCursor: string|null}>}
 */
exports.getPage = async ({ limit = 10, cursor, q } = {}) => {
  // ⚠️ `!inner` sur `menus` : jointure INTERNE, donc une boutique SANS aucun
  // plat est écartée par la base. Sans ça, une page de 10 pouvait n'en rendre
  // que 2 (le service filtre les boutiques sans menu APRÈS coup) — voire 0, et
  // le home paraissait vide alors qu'il restait des boutiques à afficher.
  //
  // On ne sélectionne qu'`id` du menu : il ne sert qu'à prouver l'existence,
  // les menus complets sont chargés ensuite par le service.
  const build = () => {
    let qb = supabase
      .from(TABLE)
      .select('*, menus!inner(id)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    const t = (q || '').trim();
    if (t) qb = qb.ilike('name', `%${t}%`);
    return qb;
  };

  /** Applique le « strictement après » du curseur à une requête. */
  const applyAfter = (qb, after) =>
    after
      ? // Tri à deux colonnes : soit createdAt est plus ancien, soit il est égal
        // et l'id est plus petit. Sans cette seconde branche, des boutiques
        // créées à la même seconde seraient sautées.
        qb.or(`created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`)
      : qb;

  // ⚠️ La jointure rend UNE ligne par menu : une boutique de 5 plats apparaît
  // 5 fois. `limit` compterait donc des menus, pas des boutiques. On lit par
  // lots en dédupliquant jusqu'à tenir `limit + 1` boutiques distinctes — la
  // ligne excédentaire signale qu'il reste une suite, sans COUNT séparé.
  const seen = new Set();
  const rows = [];
  let after = decodeCursor(cursor);
  const BATCH = (limit + 1) * 4; // marge pour les doublons de jointure
  const MAX_ROUNDS = 8; // borne dure : jamais de balayage complet de la table

  for (let round = 0; round < MAX_ROUNDS && rows.length <= limit; round++) {
    const { data, error } = await applyAfter(build(), after).limit(BATCH);
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;

    for (const row of batch) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }

    // Lot plus petit que demandé = fin de table, inutile de redemander.
    if (batch.length < BATCH) break;
    // Sinon on repart après la dernière ligne LUE de ce lot.
    const last = batch[batch.length - 1];
    after = { createdAt: last.created_at, id: last.id };
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    // La jointure interne ramène des `menus` dont on n'a pas l'usage ici (seule
    // leur existence comptait) : on ne les propage pas au mapper.
    items: page.map(({ menus, ...row }) => m.fastfood.fromSupabase(row)),
    // Le curseur porte sur la dernière boutique RENDUE, ce qui est exact ici :
    // la jointure garantit que toute boutique lue a au moins un menu, donc
    // aucune ne sera écartée ensuite par le service.
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
};

exports.getByUserId = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

exports.update = async (id, fields) => {
  // Merge en mémoire pour préserver les champs non envoyés
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Fastfood ${id} introuvable`);
  const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.fastfood.toSupabase(merged);
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return m.fastfood.fromSupabase(data);
};

// Recherche boutique par nom (option « Devenir livreur »).
// Retourne des StoreOption { id, nom } (name → nom).
exports.searchByName = async (q, { limit = 20 } = {}) => {
  const term = (q || '').trim();
  if (!term) return [];
  const { data, error } = await supabase.from(TABLE).select('id, name').ilike('name', `%${term}%`).limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, nom: r.name }));
};

exports.exists = async id => {
  const { count, error } = await supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('id', id);
  if (error) throw error;
  return (count || 0) > 0;
};
