// ============================================================================
// volumeTestFastFoods — Catalogue VOLUMINEUX pour la build de test
// ============================================================================
// Sert à la build de test (`test_app_version`, cf. settings.service) un home de
// `test_fastfood_volume` boutiques pour éprouver la fluidité de la liste sur un
// vrai volume. Les boutiques sont des CLONES des boutiques réelles, telles que
// `getFastFoodsService` les renvoie (prix, vignettes, notes déjà calculés) :
// même forme exacte que les vraies données. Rien n'est écrit en base.
//
// Identifiants dérivés et STABLES d'un appel à l'autre (`vt<i>-<id réel>`) :
// la pagination, le rafraîchissement silencieux et les clés de liste du front
// restent cohérents. Les plats clonés portent l'id de LEUR boutique clonée : une
// commande passée sur un clone échoue (boutique inconnue) au lieu d'atterrir
// chez le vrai marchand.
//
// Images : avec `test_volume_image_url` (gabarit contenant `{seed}`), chaque
// clone et chaque plat reçoit SA propre image, graine = son id cloné. Sinon les
// clones réutiliseraient les URLs réelles, déjà en cache sur le téléphone : le
// test ne mesurerait aucun vrai téléchargement. Vide = images réelles gardées.
// ============================================================================
const { getFastFoodsService } = require('./getFastFoods');

const PREFIX = 'vt';

/** Curseur opaque : l'index de la prochaine boutique, en base64url. */
const encodeCursor = index => Buffer.from(JSON.stringify({ i: index })).toString('base64url');

/** Curseur illisible = retour au début, comme la pagination réelle. */
const decodeCursor = cursor => {
  if (!cursor) return 0;
  try {
    const { i } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return Number.isInteger(i) && i >= 0 ? i : 0;
  } catch {
    return 0;
  }
};

/** URL d'image propre à `seed`, ou `null` si aucun gabarit n'est réglé. */
const imageFor = (template, seed) => (template ? template.split('{seed}').join(encodeURIComponent(seed)) : null);

/** Plat cloné ; ses images sont remplacées seulement si elles existaient. */
const cloneMenu = (menu, index, fastFoodId, template) => {
  const id = `${PREFIX}${index}-${menu.id}`;
  const clone = { ...menu, id, fastFoodId };
  const cover = imageFor(template, id);
  if (!cover) return clone;
  if (menu.image) clone.image = cover;
  if (menu.coverImage) clone.coverImage = cover;
  if (Array.isArray(menu.images)) {
    clone.images = menu.images.map((_, k) => (k === 0 ? cover : imageFor(template, `${id}-${k}`)));
  }
  return clone;
};

/** Clone `source` au rang `index` du catalogue de test. */
const cloneFastFood = (source, index, template) => {
  const id = `${PREFIX}${index}-${source.id}`;
  const image = source.image ? imageFor(template, id) : null;
  return {
    ...source,
    id,
    name: `${source.name} ${index + 1}`,
    ...(image ? { image } : {}),
    menus: (source.menus || []).map(menu => cloneMenu(menu, index, id, template)),
  };
};

/**
 * Une page du catalogue de test.
 * @param {string} [userId] uid du user courant (offres de livraison).
 * @param {{limit: number, cursor?: string}} page
 * @param {{volume: number, imageUrl?: string}} options `volume` : nombre total
 *   de boutiques du catalogue de test ; `imageUrl` : gabarit `{seed}` des images.
 * @returns {Promise<{items: Object[], nextCursor: string|null}>} même forme que
 *   `getFastFoodsService` en mode paginé.
 */
exports.getVolumeTestPage = async (userId, { limit, cursor }, { volume, imageUrl }) => {
  // Mode complet de `getFastFoodsService` : les boutiques réelles, déjà
  // enrichies et filtrées comme pour le home.
  const sources = await getFastFoodsService(userId);
  if (!sources.length) return { items: [], nextCursor: null };

  const start = Math.min(decodeCursor(cursor), volume);
  const end = Math.min(start + limit, volume);
  const items = [];
  for (let i = start; i < end; i++) items.push(cloneFastFood(sources[i % sources.length], i, imageUrl));

  return { items, nextCursor: end < volume ? encodeCursor(end) : null };
};
