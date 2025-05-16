const { bonusRequestFields } = require('../../interface/bonusRequestFields');

exports.validateBonusRequest = data => {
  const errors = [];

  for (const field in data) {
    const fieldRules = bonusRequestFields[field];
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

    // Validation spéciale pour `status` (tableau d'objets)
    if (field === 'status' && Array.isArray(data.status)) {
      data.status.forEach((item, index) => {
        if (typeof item !== 'object') {
          errors.push({
            field: `status[${index}]`,
            message: `Chaque élément de "status" doit être un objet`,
          });
          return;
        }

        if (!item.status || typeof item.status !== 'string') {
          errors.push({
            field: `status[${index}].status`,
            message: `"status" est requis et doit être une chaîne`,
          });
        }

        if (item.totalBonus !== undefined && typeof item.totalBonus !== 'number') {
          errors.push({
            field: `status[${index}].totalBonus`,
            message: `"totalBonus" doit être un nombre`,
          });
        }

        if (item.createdAt !== undefined && typeof item.createdAt !== 'string') {
          errors.push({
            field: `status[${index}].createdAt`,
            message: `"createdAt" doit être une chaîne (format ISO)`,
          });
        }
      });
    }
  }

  // Vérifier que tous les champs requis sont présents
  for (const requiredField in bonusRequestFields) {
    if (bonusRequestFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  return errors;
};
