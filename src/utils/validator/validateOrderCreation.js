const { OrderFields } = require('../../interface/orderFields');
const { validatePostMenu } = require('./validatePostMenu'); // adapte le chemin si besoin

exports.validateOrderCreation = data => {
  const errors = [];

  // Vérifier tous les champs envoyés
  for (const field in data) {
    const fieldRules = OrderFields[field];
    if (!fieldRules) {
      errors.push({
        field,
        message: `Champ non autorisé : ${field}`,
      });
      continue;
    }

    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
    if (actualType !== fieldRules.type) {
      errors.push({
        field,
        message: `Type invalide pour "${field}": attendu "${fieldRules.type}", reçu "${actualType}"`,
      });
      continue;
    }

    if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(data[field])) {
      errors.push({
        field,
        message: `Valeur invalide pour "${field}": doit être l'un de [${fieldRules.allowedValues.join(', ')}]`,
      });
    }

    // Cas particulier : validation du champ menu
    if (field === 'menu') {
      const menuErrors = validatePostMenu(data.menu);
      if (menuErrors.length > 0) {
        menuErrors.forEach(err => {
          errors.push({
            field: `menu.${err.field}`,
            message: err.message,
          });
        });
      }
    }
  }

  // Vérifier que tous les champs requis sont présents
  for (const requiredField in OrderFields) {
    if (OrderFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  return errors;
};
