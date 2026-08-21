// ============================================================================
// thumbnailUrl — URLs de vignettes servies aux clients
// ----------------------------------------------------------------------------
// Les fichiers stockés sont en pleine résolution (300 Ko à 1,1 Mo). Les cartes
// du home les affichent dans des zones de 130 à 260 px : l'essentiel des octets
// téléchargés est jeté à l'affichage.
//
// Supabase sait redimensionner à la volée via `/render/image/public/`. On sert
// donc au client une URL de vignette, l'original restant intact et accessible.
//
// Mesures sur le catalogue : carte 327 Ko -> 21 Ko (-94 %), bannière 648 Ko ->
// 88 Ko (-86 %). `format=webp` est le vrai levier, bien plus que `quality` :
// beaucoup d'originaux sont des PNG, insensibles à la compression avec perte.
//
// ⚠️ Fait ICI et non côté app : une correction backend touche tous les clients
// immédiatement, y compris les versions déjà installées, sans rebuild.
// ============================================================================

/**
 * Projets Supabase où la transformation d'images est disponible (plan Pro).
 * Sur un projet gratuit, `/render/image/` répond 403 `FeatureNotEnabled` et
 * l'image ne s'afficherait pas — d'où cette liste explicite plutôt qu'une
 * réécriture aveugle.
 */
const TRANSFORM_ENABLED_HOSTS = ['xaocrcxnueqxnyfqaayf.supabase.co'];

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

/** Largeurs servies selon l'usage (marge prise pour les écrans à forte densité). */
const WIDTHS = {
  card: 400, // carte de menu du home (130 à 260 px de large)
  detail: 900, // vue détaillée d'un plat
  banner: 828, // bannière du carrousel, pleine largeur
};

/**
 * @param {string} url URL publique Supabase Storage
 * @param {number} width largeur souhaitée en px
 * @returns {string} URL de vignette, ou l'URL d'origine si non transformable
 */
function thumbnailUrl(url, width = WIDTHS.card) {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes(OBJECT_PATH)) return url;
  if (!TRANSFORM_ENABLED_HOSTS.some(host => url.includes(host))) return url;

  return `${url.replace(OBJECT_PATH, RENDER_PATH)}?width=${width}&quality=75&format=webp`;
}

/**
 * Remplace les URLs d'images d'un menu par leurs vignettes (copie).
 * `coverImage` est la carte du home ; `images[]` alimente la vue détaillée.
 */
function withMenuThumbnails(menu) {
  if (!menu || typeof menu !== 'object') return menu;

  const out = { ...menu };
  if (menu.coverImage) out.coverImage = thumbnailUrl(menu.coverImage, WIDTHS.card);
  if (Array.isArray(menu.images)) {
    out.images = menu.images.map(u => thumbnailUrl(u, WIDTHS.detail));
  }
  return out;
}

module.exports = { thumbnailUrl, withMenuThumbnails, IMAGE_WIDTHS: WIDTHS };
