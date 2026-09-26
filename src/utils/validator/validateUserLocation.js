const { userLocationFields } = require('../../interface/userLocationFields');

/**
 * Vérifie une position envoyée par l'app : champs autorisés, requis, types,
 * bornes, valeurs permises. Retourne `errors[]` (vide = valide).
 */
exports.validateUserLocation = data => {
  const errors = [];

  for (const field in data) {
    const rules = userLocationFields[field];
    if (!rules) {
      errors.push({ field, message: `Champ non autorisé : ${field}` });
      continue;
    }
    const value = data[field];
    if (value === undefined || value === null) continue;

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rules.type) {
      errors.push({ field, message: `Type invalide pour "${field}": attendu "${rules.type}", reçu "${actualType}"` });
      continue;
    }
    if (rules.type === 'number' && !Number.isFinite(value)) {
      errors.push({ field, message: `"${field}" doit être un nombre fini` });
      continue;
    }
    if (rules.min !== undefined && value < rules.min) errors.push({ field, message: `"${field}" < ${rules.min}` });
    if (rules.max !== undefined && value > rules.max) errors.push({ field, message: `"${field}" > ${rules.max}` });
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push({ field, message: `"${field}" dépasse ${rules.maxLength} caractères` });
    }
    if (rules.allowedValues && !rules.allowedValues.includes(value)) {
      errors.push({ field, message: `Valeur invalide pour "${field}" : ${value}` });
    }
  }

  for (const field in userLocationFields) {
    if (userLocationFields[field].required && (data[field] === undefined || data[field] === null)) {
      errors.push({ field, message: `Champ requis manquant : ${field}` });
    }
  }

  if (typeof data.capturedAt === 'string' && isNaN(new Date(data.capturedAt).getTime())) {
    errors.push({ field: 'capturedAt', message: 'capturedAt doit être une date ISO 8601' });
  }

  return errors;
};
