// ============================================================================
// validateWithdrawal — validation d'une demande de retrait marchand
// ============================================================================
// Retourne un tableau d'erreurs ({ field, message }), vide si tout est valide
// (même convention que les autres validateurs du dossier).
// ============================================================================

const ALLOWED_NETWORKS = ['MTN', 'Orangemoney', 'OM'];

exports.validateWithdrawal = (data = {}) => {
  const errors = [];

  const amount = Number(data.amount);
  if (data.amount === undefined || data.amount === null || Number.isNaN(amount)) {
    errors.push({ field: 'amount', message: 'Montant requis' });
  } else if (amount <= 0) {
    errors.push({ field: 'amount', message: 'Le montant doit être supérieur à 0' });
  }

  if (!data.phone || typeof data.phone !== 'string') {
    errors.push({ field: 'phone', message: 'Numéro de téléphone requis' });
  }

  if (!data.network || typeof data.network !== 'string') {
    errors.push({ field: 'network', message: 'Réseau requis' });
  } else if (!ALLOWED_NETWORKS.includes(data.network)) {
    errors.push({
      field: 'network',
      message: `Réseau invalide : doit être l'un de [${ALLOWED_NETWORKS.join(', ')}]`,
    });
  }

  return errors;
};
