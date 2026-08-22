// ============================================================================
// thumbnailUrl — URLs d'images optimisées servies aux clients
// ----------------------------------------------------------------------------
// Les fichiers stockés pèsent 300 Ko à 1,1 Mo, majoritairement en PNG. Servis
// tels quels, ils saturent la connexion du client pour rien : le catalogue
// complet représentait 24 Mo.
//
// On passe par `/render/image/public/` de Supabase pour les servir en **WebP**,
// l'original restant intact et accessible.
//
// ⚠️ AUCUN redimensionnement : les dimensions d'origine sont conservées.
// `width` seul DÉFORME l'image — Supabase force la largeur sans ajuster la
// hauteur (500x503 devenait 400x503, ratio 0,99 -> 0,79). Le WebP suffit :
// 327 Ko -> 23 Ko (-93 %) à dimensions identiques, contre 21 Ko en
// redimensionnant. Le gain marginal du resize ne vaut pas la déformation.
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

/**
 * Réécrit une URL Supabase pour la servir en WebP, dimensions inchangées.
 *
 * @param {string} url URL publique Supabase Storage
 * @returns {string} URL optimisée, ou l'URL d'origine si non transformable
 */
function optimizedUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes(OBJECT_PATH)) return url;
  if (!TRANSFORM_ENABLED_HOSTS.some(host => url.includes(host))) return url;

  return `${url.replace(OBJECT_PATH, RENDER_PATH)}?quality=75&format=webp`;
}

/** Remplace les URLs d'images d'un menu par leurs versions optimisées (copie). */
function withMenuThumbnails(menu) {
  if (!menu || typeof menu !== 'object') return menu;

  const out = { ...menu };
  if (menu.coverImage) out.coverImage = optimizedUrl(menu.coverImage);
  if (Array.isArray(menu.images)) out.images = menu.images.map(optimizedUrl);
  return out;
}

/** Idem pour une bannière du carrousel (`imageUrl`). */
function withBannerThumbnail(banner) {
  if (!banner || typeof banner !== 'object') return banner;
  if (!banner.imageUrl) return banner;
  return { ...banner, imageUrl: optimizedUrl(banner.imageUrl) };
}

/** Idem pour l'image d'une boutique (`image`), servie par `/fastfood/all`. */
function withFastfoodThumbnail(fastfood) {
  if (!fastfood || typeof fastfood !== 'object') return fastfood;
  if (!fastfood.image) return fastfood;
  return { ...fastfood, image: optimizedUrl(fastfood.image) };
}

module.exports = {
  optimizedUrl,
  withFastfoodThumbnail,
  // Conservé sous son ancien nom : déjà appelé par getFastFoods et
  // enrichMenuForClient.
  withMenuThumbnails,
  withBannerThumbnail,
};
