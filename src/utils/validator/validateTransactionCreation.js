const { TransactionFields } = require('../../interface/transactionFields');

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

  // Validation conditionnelle : un paiement Mobile Money DOIT pouvoir devenir
  // une commande. Sans ces champs, le paiement réussit mais aucune commande
  // n'est créée (cf. mwVerdictService.js) → paiement orphelin.
  if (data.payBy === 'mobilemoney') {
    const required = ['phone', 'network', 'items'];
    for (const field of required) {
      const value = data[field];
      const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (missing) {
        errors.push({
          field,
          message: `Champ obligatoire pour un paiement mobilemoney : ${field}`,
        });
      }
    }

    // Chaque item doit être une commande complète portant son propre fastFoodId
    // (le webhook crée une commande par item — cas individuel ET panier global).
    if (Array.isArray(data.items)) {
      data.items.forEach((item, i) => {
        if (!item || typeof item !== 'object' || !item.fastFoodId) {
          errors.push({
            field: `items[${i}]`,
            message: `Chaque commande de "items" doit contenir un "fastFoodId"`,
          });
        }
      });
    }
  }

  return errors;
};
