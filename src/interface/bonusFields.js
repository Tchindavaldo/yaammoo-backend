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
  // Heures à attendre entre le téléchargement du flyer et le claim (migration 031).
  // 0 (défaut) = claim instantané, cas de tous les bonus sans preuve à constituer.
  // Porté par le bonus et non par une env : modifiable à chaud via PATCH /bonus/:id,
  // sans redéploiement.
  claimDelayHours: { type: 'number', required: false, allowZero: true },
  // Flyer à poster (image/vidéo) servi par GET /bonus/:id/flyer. Requis pour un
  // bonus `status_view` : sans lui le user n'a rien à publier.
  flyerUrl: { type: 'string', required: false },
  usageLimit: { type: 'number', required: true },
  createdAt: { type: 'string', required: false },
  // Renseigné par le backend (uid du créateur), jamais envoyé par le client.
  createdBy: { type: 'string', required: false },
};

// Sous-champs de `criteria`
// `order_count` / `amount_spent` : palier chiffré → `target` + `period` requis.
// `status_view` : aucun palier de commandes — le bonus s'obtient par une action
// externe (poster le flyer Yaammoo en statut WhatsApp), vérifiée manuellement par
// un admin à la livraison des identifiants. `target` doit être absent ou null ;
// `period` reste requis (fenêtre de re-réclamation, ex. `day`).
exports.criteriaKinds = ['order_count', 'amount_spent', 'status_view'];
exports.criteriaPeriods = ['day', 'week', 'month'];

// Kinds sans palier chiffré : éligibilité immédiate, rien à consommer.
exports.targetlessCriteriaKinds = ['status_view'];

// Sous-champs de `criteria.schedule` (campagne d'un bonus `status_view`).
// `downloadDate` : jour PRÉCIS où le flyer peut être retiré — passé ce jour, le
// téléchargement est fermé. Le post a lieu le LENDEMAIN, dans `postWindow`.
// `claimDelayHours` court depuis `postWindow.end` (cf. statusViewSchedule.util).
// `postDate` est optionnel : par défaut le lendemain de `downloadDate`.
exports.scheduleFields = ['downloadDate', 'postDate', 'postWindow', 'timezone'];
exports.postWindowFields = ['start', 'end'];
