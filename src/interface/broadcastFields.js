// ============================================================================
// Champs de POST /notification/broadcast/:fastFoodId
// ============================================================================
// Notification envoyée par une boutique. La boutique émettrice est dans l'URL
// (garde `notifications.send`), jamais dans le corps. Voir
// architecture/notifications-broadcast.md.

/** Audiences possibles ; celles d'une boutique dépendent de son plan. */
exports.BROADCAST_AUDIENCES = ['customers', 'city', 'all'];

exports.broadcastFields = {
  title: { type: 'string', required: true, maxLength: 50 },
  body: { type: 'string', required: false, maxLength: 150 },
  // URL publique (photo de menu, ou image uploadée dans `broadcasts/`).
  imageUrl: { type: 'string', required: false, maxLength: 1000 },
  // customers = clients de la boutique · city = clients d'une ville · all = tous
  audience: { type: 'string', required: true, allowedValues: exports.BROADCAST_AUDIENCES },
  // Requise si audience = 'city' : une des villes desservies par la boutique.
  city: { type: 'string', required: false, maxLength: 80 },
};
