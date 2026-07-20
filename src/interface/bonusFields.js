// interfaces/bonusFields.js — Définition d'un bonus (modèle fidélité par paliers)
// Cf. architecture/bonus.md. Seule la DÉFINITION est persistée : les champs
// dépendant du user (bonusStats, compteurs, requestStatus…) sont recalculés au GET
// et ne doivent JAMAIS être envoyés à la création.

// `type` est volontairement une chaîne libre (netflix, free_delivery, free_meal,
// discount, <futur>) : pas d'enum figé pour rester extensible.
exports.bonusFields = {
  id: { type: 'string', required: false },
  type: { type: 'string', required: true },
  name: { type: 'string', required: true },
  description: { type: 'string', required: false },
  criteria: { type: 'object', required: true },
  fastFoodId: { type: 'string', required: false },
  fastFoodName: { type: 'string', required: false },
  active: { type: 'bool', required: false },
  // true = le bonus exige une livraison manuelle (identifiants Netflix, clé de
  // jeu…). Le claim reste alors `pending` jusqu'à ce qu'un admin/marchand
  // fournisse les identifiants via POST /bonus/request/:id/reward-credentials.
  // Défaut false = auto-approuvé (livraison offerte, réduction…).
  requiresRewardCredentials: { type: 'bool', required: false },
  // true = l'accès passe par un profil nominatif protégé par son propre code
  // (Netflix : compte partagé, un profil + un code par utilisateur). La livraison
  // exige alors `rewardCredentials.profile` = {name, code}, sinon 400.
  // Porté par le bonus (et non déduit de `type`) pour rester modifiable via
  // PATCH /bonus/:id sans redéploiement.
  requiresProfile: { type: 'bool', required: false },
  claimDuration: { type: 'number', required: true },
  usageLimit: { type: 'number', required: true },
  createdAt: { type: 'string', required: false },
  // Renseigné par le backend (uid du créateur), jamais envoyé par le client.
  createdBy: { type: 'string', required: false },
};

// Sous-champs de `criteria`
// Tout bonus a un palier : `target` + `period` sont toujours requis.
exports.criteriaKinds = ['order_count', 'amount_spent'];
exports.criteriaPeriods = ['day', 'week', 'month'];
