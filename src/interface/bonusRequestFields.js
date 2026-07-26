// interfaces/bonusRequest.js
// Une réclamation = une LIGNE (migration 029) : les cycles précédents restent
// en base comme historique, seule `isCurrent` décrit le présent.
exports.bonusRequestFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  bonusId: { type: 'string', required: true },
  status: { type: 'array', required: false },
  // Réclamation courante de ce (user, bonus). Posé par le backend
  // (`createCurrent`), jamais envoyé par le client.
  isCurrent: { type: 'bool', required: false },
};
