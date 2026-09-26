const { broadcastFields } = require('../../interface/broadcastFields');

/**
 * Vérifie le payload d'un envoi de boutique : champs autorisés, requis, types,
 * valeurs permises, longueurs. Retourne `errors[]` (vide = valide).
 */
exports.validateBroadcast = data => {
  const errors = [];

  for (const field in data) {
    const rules = broadcastFields[field];
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
    if (rules.allowedValues && !rules.allowedValues.includes(value)) {
      errors.push({ field, message: `Valeur invalide pour "${field}" : ${value}` });
    }
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push({ field, message: `"${field}" dépasse ${rules.maxLength} caractères` });
    }
  }

  for (const field in broadcastFields) {
    if (broadcastFields[field].required && (data[field] === undefined || data[field] === null || data[field] === '')) {
      errors.push({ field, message: `Champ requis manquant : ${field}` });
    }
  }

  if (typeof data.title === 'string' && !data.title.trim()) {
    errors.push({ field: 'title', message: 'Le titre ne peut pas être vide' });
  }
  if (data.audience === 'city' && !(typeof data.city === 'string' && data.city.trim())) {
    errors.push({ field: 'city', message: 'Ville requise pour l’audience « city »' });
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl && !data.imageUrl.startsWith('https://')) {
    errors.push({ field: 'imageUrl', message: 'imageUrl doit être une URL https' });
  }

  return errors;
};
