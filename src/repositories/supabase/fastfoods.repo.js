// ============================================================================
// Fastfoods Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'fastfoods';

// ⚠️ Toutes les lectures ci-dessous excluent les boutiques en corbeille
// (`deleted_at IS NOT NULL`, migration 047). Une boutique supprimée par un admin
// doit disparaître du home et de l'API immédiatement, même si son effacement
// définitif n'intervient que 30 jours plus tard.
// Pour LIRE une boutique supprimée (écrans d'administration), passer par
// `fastfoodDeletion.repo.js`, qui ne filtre pas.
const alive = qb => qb.is('deleted_at', null);

// ── Régime de livraison EFFECTIF (interrupteur global, migration 074) ────────
// `platform_delivery_all` (settings_app) = true : toute boutique qui A des zones
// plateforme est lue en `deliveryBy = 'platform'`, sans rien écrire en base.
// Une boutique sans zones plateforme reste livrée par son marchand.
// Appliqué ICI, à la lecture, pour que TOUS les consommateurs (affichage,
// contrôle du montant, règlement, crédits) voient le même régime.
// `deliveryByOwn` garde le réglage propre de la boutique (écran admin).
function hasPlatformZones(ff) {
  const periodic = Array.isArray(ff?.platformDeliveryZones) && ff.platformDeliveryZones.some(h => h?.periodicZones?.length > 0);
  return periodic || (Array.isArray(ff?.platformExpressZones) && ff.platformExpressZones.length > 0);
}
function applyRegime(ff, all) {
  if (!ff) return ff;
  const own = ff.deliveryBy || 'fastfood';
  const deliveryBy = all && hasPlatformZones(ff) ? 'platform' : own;
  return { ...ff, deliveryBy, deliveryByOwn: own };
}
async function platformAll() {
  // Require paresseux : settings.service importe les repositories (cycle).
  return require('../../services/settings/settings.service').getPlatformDeliveryAll();
}
const withRegime = async ff => applyRegime(ff, await platformAll());
const withRegimeList = async list => {
  const all = await platformAll();
  return (list || []).map(ff => applyRegime(ff, all));
};

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.fastfood.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return withRegime(m.fastfood.fromSupabase(row));
};

exports.getById = async id => {
  const { data, error } = await alive(supabase.from(TABLE).select('*').eq('id', id)).maybeSingle();
  if (error) throw error;
  return withRegime(m.fastfood.fromSupabase(data));
};

exports.getAll = async () => {
  const { data, error } = await alive(supabase.from(TABLE).select('*'));
  if (error) throw error;
  return withRegimeList((data || []).map(m.fastfood.fromSupabase));
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
 * @param {string}  [opts.city] ville desservie (élément de `cities`), choix du home
 * @param {string}  [opts.category] catégorie de plat (`menus.category`, insensible à la casse)
 * @returns {Promise<{items: Object[], nextCursor: string|null}>}
 */
/** Plafond des boutiques retenues par la recherche sur les plats. */
const SEARCH_MENU_SHOPS = 500;

/**
 * Ids des boutiques dont au moins un plat vivant correspond a `term`
 * (`name` ou `titre`, `ilike`). Resolu en base : on ne charge que des ids.
 */
const shopIdsWithMenuMatching = async term => {
  const { data, error } = await supabase
    .from('menus')
    .select('fastfood_id')
    .is('deleted_at', null)
    .or(`name.ilike.%${term}%,titre.ilike.%${term}%`)
    .limit(SEARCH_MENU_SHOPS * 4);
  if (error) throw error;
  return [...new Set((data || []).map(r => r.fastfood_id))].slice(0, SEARCH_MENU_SHOPS);
};

exports.getPage = async ({ limit = 10, cursor, q, city, category } = {}) => {
  // Recherche : nom de la boutique OU nom d'un de ses plats. Caracteres
  // reserves de la syntaxe `or()` PostgREST retires de la saisie.
  const term = (q || '')
    .trim()
    .replace(/[,()%*\\]/g, ' ')
    .trim();
  const menuShopIds = term ? await shopIdsWithMenuMatching(term) : [];

  // ⚠️ `!inner` sur `menus` : jointure INTERNE, donc une boutique SANS aucun
  // plat est écartée par la base. Sans ça, une page de 10 pouvait n'en rendre
  // que 2 (le service filtre les boutiques sans menu APRÈS coup) — voire 0, et
  // le home paraissait vide alors qu'il restait des boutiques à afficher.
  //
  // On ne sélectionne qu'`id` du menu : il ne sert qu'à prouver l'existence,
  // les menus complets sont chargés ensuite par le service.
  const build = () => {
    let qb = alive(supabase.from(TABLE).select('*, menus!inner(id)'))
      // Le filtre porte aussi sur la table jointe : un menu en corbeille ne doit
      // pas suffire à faire apparaître sa boutique sur le home.
      .is('menus.deleted_at', null)
      // Boutique indisponible (coupée OU aucun jour d'ouverture) et plats
      // indisponibles : absents du home. Filtré ICI et pas seulement dans le
      // service, sinon une page rendrait moins de `limit` boutiques.
      .eq('is_available', true)
      .neq('open_days', '{}')
      .or('status.is.null,status.neq.unavailable', { referencedTable: 'menus' })
      .or('disponibilite.is.null,disponibilite.eq.true', { referencedTable: 'menus' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (term) {
      qb = menuShopIds.length ? qb.or(`name.ilike.%${term}%,id.in.(${menuShopIds.join(',')})`) : qb.ilike('name', `%${term}%`);
    }
    // Filtre catégorie du home : la jointure interne ne garde que les boutiques
    // ayant au moins un plat vivant de cette catégorie (migration 088).
    if (category) qb = qb.ilike('menus.category', category);
    // Ville choisie au home : boutiques qui la desservent (`cities` JSONB).
    if (city) qb = qb.filter('cities', 'cs', JSON.stringify([city]));
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
    items: await withRegimeList(page.map(({ menus, ...row }) => m.fastfood.fromSupabase(row))),
    // Le curseur porte sur la dernière boutique RENDUE, ce qui est exact ici :
    // la jointure garantit que toute boutique lue a au moins un menu, donc
    // aucune ne sera écartée ensuite par le service.
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
};

exports.getByUserId = async userId => {
  const { data, error } = await alive(supabase.from(TABLE).select('*').eq('user_id', userId)).maybeSingle();
  if (error) throw error;
  return withRegime(m.fastfood.fromSupabase(data));
};

exports.update = async (id, fields) => {
  // Merge en mémoire pour préserver les champs non envoyés
  const existing = await exports.getById(id);
  if (!existing) throw new Error(`Fastfood ${id} introuvable`);
  // ⚠️ `existing` porte le régime EFFECTIF (interrupteur global) : on réécrit
  // le réglage PROPRE de la boutique, sinon une simple mise à jour figerait
  // `delivery_by = 'platform'` en base pendant que l'interrupteur est actif.
  const { deliveryByOwn, ...stored } = existing;
  const merged = { ...stored, deliveryBy: deliveryByOwn, ...fields, id, updatedAt: new Date().toISOString() };
  const payload = m.fastfood.toSupabase(merged);
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return withRegime(m.fastfood.fromSupabase(data));
};

// Recherche boutique par nom (option « Devenir livreur »).
// Retourne des StoreOption { id, nom } (name → nom).
exports.searchByName = async (q, { limit = 20 } = {}) => {
  const term = (q || '').trim();
  if (!term) return [];
  const { data, error } = await alive(supabase.from(TABLE).select('id, name').ilike('name', `%${term}%`)).limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, nom: r.name }));
};

exports.exists = async id => {
  const { count, error } = await alive(supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('id', id));
  if (error) throw error;
  return (count || 0) > 0;
};

/** Stats du hero marchand : fonction SQL `merchant_stats` (migration 070). */
exports.getMerchantStats = async (fastFoodId, from, to, bucket) => {
  const { data, error } = await supabase.rpc('merchant_stats', { p_fastfood_id: fastFoodId, p_from: from, p_to: to, p_bucket: bucket });
  if (error) throw error;
  return data;
};
