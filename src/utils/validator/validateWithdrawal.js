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
