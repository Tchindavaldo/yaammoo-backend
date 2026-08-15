// ============================================================================
// bannersService — CRUD + réordonnancement automatique du carrousel
// ============================================================================
// Règle métier : le carrousel garde une séquence CONTIGUE 0..n-1. Quand l'admin
// donne un `sortOrder` déjà pris (ou au-delà), la liste est re-normalisée en
// mémoire puis ré-écrite : les suivants sont décalés, aucune position n'est
// dupliquée. Le nombre de banners étant faible (carrousel), les écritures en
// boucle sont acceptables et garantissent une séquence exacte.
// ============================================================================
const repos = require('../../repositories');
const { deleteImageFromSupabase } = require('../images/uploadImage.service');

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

// Ré-attribue 0..n-1 après une mutation, sans changement de contenu.
const reindex = banners => banners.map((b, i) => ({ ...b, sortOrder: i }));

/** Banners actifs servis au home (déjà triés par le repo). */
exports.getActiveBanners = async () => repos.banners.getActive();

/** Tous les banners (admin). */
exports.getAllBanners = async () => repos.banners.getAll();

/** Cree un banner, insere a la position demandee (sans doublon). */
exports.createBanner = async (data, requestedOrder) => {
  const all = await repos.banners.getAll();
  const insertAt = clamp(requestedOrder, 0, all.length);

  const created = await repos.banners.create({ ...data, sortOrder: insertAt });

  const next = [...all];
  next.splice(insertAt, 0, created);
  const reindexed = reindex(next);
  await repos.banners.applyOrder(reindexed.map(({ id, sortOrder }) => ({ id, sortOrder })));

  return reindexed[insertAt] || created;
};

/** Met a jour un banner et le deplace a la position demandee (sans doublon). */
exports.updateBanner = async (id, fields, requestedOrder) => {
  const all = await repos.banners.getAll();
  const existing = all.find(b => b.id === id);
  if (!existing) throw new Error(`Banner ${id} introuvable`);

  // Si aucun ordre n'est fourni, on garde la position courante.
  const target = requestedOrder != null ? clamp(requestedOrder, 0, all.length - 1) : existing.sortOrder;

  const withoutThis = all.filter(b => b.id !== id);
  const item = { ...existing, ...fields, sortOrder: target };

  const next = [];
  let inserted = false;
  for (const b of withoutThis) {
    if (!inserted && next.length === target) {
      next.push(item);
      inserted = true;
    }
    next.push(b);
  }
  if (!inserted) next.push(item);

  const reindexed = reindex(next);
  const finalOrder = reindexed.find(b => b.id === id);

  // Persiste d'abord les champs, puis remet a plat l'ordre.
  await repos.banners.update(id, fields);
  await repos.banners.applyOrder(reindexed.map(({ id: bid, sortOrder }) => ({ id: bid, sortOrder })));

  return finalOrder || item;
};

/** Supprime un banner, purge son image Supabase Storage, puis re-normalise l'ordre des survivants. */
exports.deleteBanner = async id => {
  const all = await repos.banners.getAll();
  const targetBanner = all.find(b => b.id === id);
  if (!targetBanner) throw new Error(`Banner ${id} introuvable`);

  // 1. Suppression de la bannière en BDD
  await repos.banners.remove(id);

  // 2. Suppression de l'image du storage Supabase si elle existe
  if (targetBanner.imageUrl) {
    try {
      await deleteImageFromSupabase(targetBanner.imageUrl);
    } catch (err) {
      console.warn(`[deleteBanner] Impossible de supprimer l'image (${targetBanner.imageUrl}) :`, err.message);
    }
  }

  // 3. Réordonnancement des bannières restantes
  const without = all.filter(b => b.id !== id);
  const reindexed = reindex(without);
  if (reindexed.length > 0) {
    await repos.banners.applyOrder(reindexed.map(({ id: bid, sortOrder }) => ({ id: bid, sortOrder })));
  }
};

