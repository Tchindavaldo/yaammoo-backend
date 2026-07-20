const { bonusFields, criteriaKinds, criteriaPeriods } = require('../../interface/bonusFields');

/**
 * Valide `criteria` : le cœur du modèle (c'est lui qui pilote l'éligibilité et
 * le décrément du solde). Un criteria mal formé rend le bonus silencieusement
 * inutilisable — d'où des règles strictes ici.
 */
function validateCriteria(criteria, errors) {
  if (typeof criteria !== 'object' || criteria === null || Array.isArray(criteria)) {
    errors.push({ field: 'criteria', message: '"criteria" doit être un objet' });
    return;
  }

  const { kind, target, period } = criteria;

  if (!kind || !criteriaKinds.includes(kind)) {
    errors.push({
      field: 'criteria.kind',
      message: `"criteria.kind" est requis et doit être l'un de [${criteriaKinds.join(', ')}]`,
    });
    return; // sans kind valide, inutile de valider target/period
  }

  // Palier + fenêtre toujours obligatoires.
  if (typeof target !== 'number' || Number.isNaN(target)) {
    errors.push({ field: 'criteria.target', message: `"criteria.target" est requis (nombre) pour kind=${kind}` });
  } else if (target <= 0) {
    errors.push({ field: 'criteria.target', message: '"criteria.target" doit être supérieur à 0' });
  } else if (kind === 'order_count' && !Number.isInteger(target)) {
    errors.push({ field: 'criteria.target', message: '"criteria.target" doit être un entier pour kind=order_count' });
  }

  if (!period || !criteriaPeriods.includes(period)) {
    errors.push({
      field: 'criteria.period',
      message: `"criteria.period" est requis pour kind=${kind} et doit être l'un de [${criteriaPeriods.join(', ')}]`,
    });
  }
}

/**
 * Valide la définition d'un bonus avant persistance.
 * @param {Object} data corps de la requête
 * @returns {Array} liste d'erreurs ({field, message}) — vide si valide
 */
exports.validateBonus = (data, { partial = false } = {}) => {
  const errors = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [{ field: 'body', message: 'Le corps de la requête doit être un objet' }];
  }

  // Mode partiel (PATCH) : au moins un champ à modifier.
  if (partial && Object.keys(data).length === 0) {
    return [{ field: 'body', message: 'Aucun champ à modifier' }];
  }

  // Champs envoyés : autorisés ? bon type ?
  for (const field in data) {
    const rules = bonusFields[field];
    if (!rules) {
      errors.push({ field, message: `Champ non autorisé : ${field}` });
      continue;
    }

    const value = data[field];
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (rules.type === 'bool') {
      if (actualType !== 'boolean') {
        errors.push({ field, message: `Type invalide pour "${field}": attendu "boolean", reçu "${actualType}"` });
      }
      continue;
    }

    if (rules.type === 'object') {
      continue; // validé finement plus bas (criteria)
    }

    if (actualType !== rules.type) {
      errors.push({ field, message: `Type invalide pour "${field}": attendu "${rules.type}", reçu "${actualType}"` });
      continue;
    }

    if (rules.type === 'string' && value.trim() === '') {
      errors.push({ field, message: `"${field}" ne doit pas être vide` });
    }

    if (rules.type === 'number' && value <= 0) {
      errors.push({ field, message: `"${field}" doit être supérieur à 0` });
    }
  }

  // Champs obligatoires présents ? (ignoré en PATCH : mise à jour partielle)
  for (const field in bonusFields) {
    if (!partial && bonusFields[field].required && !(field in data)) {
      errors.push({ field, message: `Champ obligatoire manquant : ${field}` });
    }
  }

  if ('criteria' in data) validateCriteria(data.criteria, errors);

  // `fastFoodName` est TOUJOURS résolu côté backend depuis la boutique (le nom
  // envoyé par un client pourrait ne pas correspondre au fastFoodId).
  if ('fastFoodName' in data) {
    errors.push({
      field: 'fastFoodName',
      message: '"fastFoodName" est déterminé par le serveur et ne doit pas être envoyé',
    });
  }

  return errors;
};
