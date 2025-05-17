const { TransactionFields } = require('../../interface/fastfoodFields');

exports.validateTransactionCreation = data => {
  const errors = [];

  // Vérification des champs envoyés
  for (const field in data) {
    const fieldRules = TransactionFields[field];

    if (!fieldRules) {
      errors.push({
        field,
        message: `Champ non autorisé : ${field}`,
      });
      continue;
    }

    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
    const expectedType = fieldRules.type === 'bool' ? 'boolean' : fieldRules.type;

    if (actualType !== expectedType) {
      errors.push({
        field,
        message: `Type invalide pour "${field}" : attendu "${expectedType}", reçu "${actualType}"`,
      });
      continue;
    }

    if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(data[field])) {
      errors.push({
        field,
        message: `Valeur invalide pour "${field}" : doit être l'un de [${fieldRules.allowedValues.join(', ')}]`,
      });
    }
  }

  // Vérification des champs requis
  for (const requiredField in TransactionFields) {
    if (TransactionFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  return errors;
};
