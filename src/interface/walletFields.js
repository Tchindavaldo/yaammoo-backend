// ============================================================================
// walletFields — Payloads reçus par les routes /wallet
// ============================================================================
// Réseaux : valeurs EXACTES 'MTN' | 'ORANGEMONEY' (celles de MobileWallet
// /payout), sensibles à la casse.
// ============================================================================

// POST /wallet/withdraw
exports.WithdrawFields = {
  // Montant REÇU sur le numéro de réception (FCFA). Les frais interréseau
  // éventuels sont débités EN PLUS du solde source.
  amount: { type: 'number', required: true },
  // Numéro de réception (normalisé en 237XXXXXXXXX par le backend).
  phone: { type: 'string', required: true },
  // Réseau du numéro de réception (détecté via POST /wallet/operator/predict).
  network: { type: 'string', required: true, enum: ['MTN', 'ORANGEMONEY'] },
  // Solde débité, choisi par l'utilisateur. Aucun repli automatique.
  sourceNetwork: { type: 'string', required: true, enum: ['MTN', 'ORANGEMONEY'] },
  receiverName: { type: 'string', required: false },
  narration: { type: 'string', required: false },
};

// GET /wallet/withdraw/quote (query string)
exports.WithdrawQuoteFields = {
  amount: { type: 'number', required: true },
  network: { type: 'string', required: true, enum: ['MTN', 'ORANGEMONEY'] },
  sourceNetwork: { type: 'string', required: true, enum: ['MTN', 'ORANGEMONEY'] },
};

// POST /wallet/operator/predict
exports.OperatorPredictFields = {
  // Numéro saisi librement (espaces, +237, 0…).
  phone: { type: 'string', required: true },
};

// POST /wallet/admin/platform-transfer (admin uniquement)
// Verse de la marge plateforme sur le portefeuille d'une boutique. Chaque
// source est prélevée sur la marge d'UNE boutique, sur UN réseau, et créditée
// au destinataire sur ce MÊME réseau. Frais kiosque INCLUS dans le montant.
exports.PlatformTransferFields = {
  // Boutique créditée (son propriétaire reçoit la transaction).
  toFastFoodId: { type: 'string', required: true },
  // Au moins une source.
  sources: { type: 'array', required: true },
  // Boutique dont la marge est prélevée (peut être le destinataire lui-même).
  'sources[].fastFoodId': { type: 'string', required: true },
  // Réseau de la marge prélevée = solde crédité chez le destinataire.
  'sources[].network': { type: 'string', required: true, enum: ['MTN', 'ORANGEMONEY'] },
  // Montant (FCFA, entier > 0), plafonné à la marge encore disponible.
  'sources[].amount': { type: 'number', required: true },
  // Motif libre, gardé pour la traçabilité.
  reason: { type: 'string', required: false },
};
