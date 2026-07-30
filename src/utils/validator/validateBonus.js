const { bonusFields, criteriaKinds, criteriaPeriods, targetlessCriteriaKinds } = require('../../interface/bonusFields');

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

  // Kinds sans palier chiffré (status_view) : `target` doit rester vide — accepter
  // un nombre laisserait croire à un palier que rien ne mesure.
  if (targetlessCriteriaKinds.includes(kind)) {
    if (target != null && target !== '') {
      errors.push({ field: 'criteria.target', message: `"criteria.target" doit être null ou absent pour kind=${kind}` });
    }
    if (!period || !criteriaPeriods.includes(period)) {
      errors.push({
        field: 'criteria.period',
        message: `"criteria.period" est requis pour kind=${kind} et doit être l'un de [${criteriaPeriods.join(', ')}]`,
      });
    }
    return;
  }

  // Palier + fenêtre obligatoires pour les kinds chiffrés.
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

    // `allowZero` : un délai de 0 h est légitime (claim instantané), contrairement
    // à une durée de validité ou une limite d'usage nulles.
    if (rules.type === 'number' && (rules.allowZero ? value < 0 : value <= 0)) {
      errors.push({
        field,
        message: rules.allowZero ? `"${field}" ne peut pas être négatif` : `"${field}" doit être supérieur à 0`,
      });
    }
  }

  // Champs obligatoires présents ? (ignoré en PATCH : mise à jour partielle)
  for (const field in bonusFields) {
    if (!partial && bonusFields[field].required && !(field in data)) {
      errors.push({ field, message: `Champ obligatoire manquant : ${field}` });
    }
  }

  if ('criteria' in data) validateCriteria(data.criteria, errors);

  // Un bonus `status_view` sans flyer n'a rien à faire poster : il serait
  // inréclamable (GET /bonus/:id/flyer renverrait 404 et le claim resterait bloqué).
  // En PATCH, le flyer peut déjà être en base : on n'exige que si le criteria change.
  if (targetlessCriteriaKinds.includes(data.criteria?.kind) && !partial && !data.flyerUrl) {
    errors.push({ field: 'flyerUrl', message: `"flyerUrl" est requis pour kind=${data.criteria.kind}` });
  }

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
