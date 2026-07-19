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
  claimDuration: { type: 'number', required: true },
  usageLimit: { type: 'number', required: true },
  createdAt: { type: 'string', required: false },
};

// Sous-champs de `criteria`
exports.criteriaKinds = ['welcome', 'order_count', 'amount_spent'];
exports.criteriaPeriods = ['day', 'week', 'month'];
