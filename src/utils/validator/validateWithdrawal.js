// ============================================================================
// validateWithdrawal — validation d'une demande (ou d'un devis) de retrait
// ============================================================================
// Retourne un tableau d'erreurs ({ field, message }), vide si tout est valide
// (même convention que les autres validateurs du dossier).
// Champs déclarés dans `src/interface/walletFields.js`.
// ============================================================================

// Sensible à la casse : valeurs EXACTES attendues par MobileWallet /payout.
// Le front DOIT envoyer exactement 'MTN' ou 'ORANGEMONEY'.
const ALLOWED_NETWORKS = ['MTN', 'ORANGEMONEY'];

function checkNetwork(errors, field, value, label) {
  if (!value || typeof value !== 'string') {
    errors.push({ field, message: `${label} requis` });
  } else if (!ALLOWED_NETWORKS.includes(value)) {
    errors.push({ field, message: `${label} invalide : doit être l'un de [${ALLOWED_NETWORKS.join(', ')}]` });
  }
}

function checkAmount(errors, raw) {
  const amount = Number(raw);
  if (raw === undefined || raw === null || raw === '' || Number.isNaN(amount)) {
    errors.push({ field: 'amount', message: 'Montant requis' });
  } else if (amount <= 0) {
    errors.push({ field: 'amount', message: 'Le montant doit être supérieur à 0' });
  } else if (!Number.isInteger(amount)) {
    errors.push({ field: 'amount', message: 'Le montant doit être un nombre entier de FCFA' });
  }
}

/** Devis : montant + réseau de réception + solde source. */
exports.validateWithdrawalQuote = (data = {}) => {
  const errors = [];
  checkAmount(errors, data.amount);
  checkNetwork(errors, 'network', data.network, 'Réseau de réception');
  checkNetwork(errors, 'sourceNetwork', data.sourceNetwork, 'Solde à débiter');
  return errors;
};

/** Retrait : le devis + le numéro de réception. */
exports.validateWithdrawal = (data = {}) => {
  const errors = exports.validateWithdrawalQuote(data);
  if (!data.phone || typeof data.phone !== 'string') {
    errors.push({ field: 'phone', message: 'Numéro de téléphone requis' });
  }
  return errors;
};

/** Transfert de marge plateforme (admin) : destinataire + sources. */
exports.validatePlatformTransfer = (data = {}) => {
  const errors = [];
  if (!data.toFastFoodId || typeof data.toFastFoodId !== 'string') {
    errors.push({ field: 'toFastFoodId', message: 'Boutique destinataire requise' });
  }
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    errors.push({ field: 'sources', message: 'Au moins une source requise' });
    return errors;
  }
  data.sources.forEach((src, i) => {
    const s = src || {};
    if (!s.fastFoodId || typeof s.fastFoodId !== 'string') errors.push({ field: `sources[${i}].fastFoodId`, message: 'Boutique source requise' });
    checkNetwork(errors, `sources[${i}].network`, s.network, 'Réseau de la source');
    const sub = [];
    checkAmount(sub, s.amount);
    sub.forEach(e => errors.push({ field: `sources[${i}].amount`, message: e.message }));
  });
  if (data.reason !== undefined && typeof data.reason !== 'string') errors.push({ field: 'reason', message: 'Motif invalide' });
  return errors;
};
