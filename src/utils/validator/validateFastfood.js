const { FastfoodFields } = require('../../interface/fastfoodFields');

exports.validateFastfood = data => {
  const errors = [];

  // Vérifier tous les champs envoyés
  for (const field in data) {
    const fieldRules = FastfoodFields[field];
    if (!fieldRules) {
      errors.push({
        field,
        message: `Champ non autorisé : ${field}`,
      });
      continue;
    }

    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];

    // Adaptation pour le type booléen
    if (fieldRules.type === 'bool') {
      if (actualType !== 'boolean') {
        errors.push({
          field,
          message: `Type invalide pour "${field}": attendu "boolean", reçu "${actualType}"`,
        });
      }
    } else if (actualType !== fieldRules.type) {
      errors.push({
        field,
        message: `Type invalide pour "${field}": attendu "${fieldRules.type}", reçu "${actualType}"`,
      });
    }

    if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(data[field])) {
      errors.push({
        field,
        message: `Valeur invalide pour "${field}": doit être l'un de [${fieldRules.allowedValues.join(', ')}]`,
      });
    }
  }

  // Vérifier que tous les champs requis sont présents
  for (const requiredField in FastfoodFields) {
    if (FastfoodFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  return errors;
};
