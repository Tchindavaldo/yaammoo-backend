// utils/validateOrderUpdate.js
const { menuFields } = require('../../interface/menuFields');

exports.validatePostMenu = data => {
  const errors = [];

  for (const field in data) {
    const fieldRules = menuFields[field];
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

    // Cas particulier : validation des objets dans le tableau `prices`
    if (field === 'prices') {
      if (!Array.isArray(data.prices)) {
        errors.push({
          field: 'prices',
          message: `"prices" doit être un tableau`,
        });
      } else if (data.prices.length === 0) {
        errors.push({
          field: 'prices',
          message: `Le tableau "prices" doit contenir au moins un élément`,
        });
      } else {
        data.prices.forEach((item, index) => {
          if (typeof item !== 'object') {
            errors.push({
              field: `prices[${index}]`,
              message: `Chaque élément de "prices" doit être un objet`,
            });
            return;
          }

          if (typeof item.price !== 'number') {
            errors.push({
              field: `prices[${index}].price`,
              message: `"price" doit être un nombre`,
            });
          }

          if (item.description && typeof item.description !== 'string') {
            errors.push({
              field: `prices[${index}].description`,
              message: `"description" doit être une chaîne de caractères`,
            });
          }
        });
      }
    }

    if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(data[field])) {
      errors.push({
        field,
        message: `Valeur invalide pour "${field}": doit être l'un de [${fieldRules.allowedValues.join(', ')}]`,
      });
    }
  }

  // Vérifier que tous les champs requis sont présents
  for (const requiredField in menuFields) {
    if (menuFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  return errors;
};
