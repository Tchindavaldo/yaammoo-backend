/**
 * Validation générique d'un payload contre une table de champs
 * (`interface/<domaine>Fields.js`) : champs autorisés, requis, types, bornes
 * (`min` / `max`), longueur (`maxLength`), valeurs permises, date ISO pour
 * `capturedAt`. Retourne `errors[]` (vide = valide).
 *
 * Partagée par les positions utilisateur et livreur.
 */
exports.validateFieldRules = (fields, data) => {
  const errors = [];

  for (const field in data) {
    const rules = fields[field];
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

  for (const field in fields) {
    if (fields[field].required && (data[field] === undefined || data[field] === null)) {
      errors.push({ field, message: `Champ requis manquant : ${field}` });
    }
  }

  if (typeof data.capturedAt === 'string' && isNaN(new Date(data.capturedAt).getTime())) {
    errors.push({ field: 'capturedAt', message: 'capturedAt doit être une date ISO 8601' });
  }

  return errors;
};
