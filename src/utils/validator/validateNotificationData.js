const { notificationFields } = require('../../interface/notificationFields');

exports.validateNotificationData = data => {
  const errors = [];

  // Vérifie les types
  for (const field in data) {
    const fieldRules = notificationFields[field];
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
    }
  }

  // Vérifie les champs obligatoires
  for (const requiredField in notificationFields) {
    if (notificationFields[requiredField].required && !(requiredField in data)) {
      errors.push({
        field: requiredField,
        message: `Champ obligatoire manquant : ${requiredField}`,
      });
    }
  }

  // Règles d'exclusion mutuelle
  const exclusifs = [
    ['userId', 'target'],
    ['userId', 'fastFoodId'],
  ];

  exclusifs.forEach(pair => {
    const [field1, field2] = pair;
    if (field1 in data && field2 in data) {
      errors.push({
        field: `${field1}, ${field2}`,
        message: `Les champs "${field1}" et "${field2}" ne peuvent pas être utilisés ensemble.`,
      });
    }
  });

  return errors;
};
