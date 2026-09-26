// ============================================================================
// shopSender — Expéditeur « boutique » d'une notification push
// ============================================================================
// Une notification envoyée au nom d'une boutique porte son nom et son logo :
// l'app l'affiche comme un message de la boutique (logo en avatar, icône de
// l'app en pastille, comme WhatsApp).
//   - iOS : notification de communication, construite par l'extension
//     NotificationService de l'app.
//   - Android : conversation, construite par le module natif
//     `modules/notification-style` de l'app.
//
// Sans logo exploitable : `null`, la notification garde l'icône de l'app.
// ============================================================================
const { avatarUrl } = require('../../images/thumbnailUrl');

/**
 * @param {{ id?: string, name?: string, image?: string } | null} fastFood
 * @returns {{ id: string, name: string, imageUrl: string } | null}
 */
exports.shopSender = fastFood => {
  if (!fastFood || !fastFood.id) return null;
  const name = typeof fastFood.name === 'string' ? fastFood.name.trim() : '';
  const image = typeof fastFood.image === 'string' ? fastFood.image.trim() : '';
  // HTTPS seulement : iOS refuse le HTTP clair (ATS), Android aussi par défaut.
  if (!name || !/^https:\/\//i.test(image)) return null;
  return { id: String(fastFood.id), name, imageUrl: avatarUrl(image) };
};
