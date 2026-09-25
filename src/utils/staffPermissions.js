// ============================================================================
// Catalogue des permissions attribuables à un rôle d'employé
// ============================================================================
// Clé stockée dans `staff_roles.permissions`. Le propriétaire de la boutique et
// l'admin plateforme les ont TOUTES implicitement.
// ============================================================================

const PERMISSIONS = {
  'orders.validate': 'Valider une commande (pending → processing)',
  'orders.finish': 'Marquer une commande prête (processing → finished)',
  'orders.deliver': 'Lancer / terminer la livraison, assigner un livreur (finished → delivering → delivered)',
  'orders.cancel': 'Annuler une commande côté boutique (cancelByFastFood)',
  'menus.manage': 'Créer, modifier, supprimer les menus',
  'fastfood.update': 'Modifier les infos de la boutique',
  'notifications.send': 'Envoyer des notifications',
  'support.reply': 'Répondre aux clients (messagerie)',
  'staff.manage': 'Créer / modifier des employés et des rôles',
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

// Statut CIBLE d'une transition de commande → permission requise.
// La cible est déduite du statut ACTUEL (machine à états de updateOrders).
const NEXT_STATUS = { pending: 'processing', processing: 'finished', finished: 'delivering', delivering: 'delivered' };
const PERMISSION_FOR_TARGET = {
  processing: 'orders.validate',
  finished: 'orders.finish',
  delivering: 'orders.deliver',
  delivered: 'orders.deliver',
  cancelByFastFood: 'orders.cancel',
};

/**
 * Permission requise pour faire évoluer une commande.
 * @param {string} currentStatus statut en base
 * @param {string} [requestedStatus] statut envoyé (seules les annulations passent tel quel)
 * @returns {string|null} null = transition hors périmètre boutique (ex. pendingToBuy → pending, payée par le client)
 */
const permissionForOrderTransition = (currentStatus, requestedStatus) => {
  if (requestedStatus === 'cancelByFastFood') return PERMISSION_FOR_TARGET.cancelByFastFood;
  return PERMISSION_FOR_TARGET[NEXT_STATUS[currentStatus]] || null;
};

const invalidPermissions = list => (Array.isArray(list) ? list.filter(p => !ALL_PERMISSIONS.includes(p)) : ['(pas un tableau)']);

module.exports = { PERMISSIONS, ALL_PERMISSIONS, permissionForOrderTransition, invalidPermissions };
