const { OrderFields } = require('../../interface/orderFields');

/**
 * Valide un objet selon les règles spécifiées
 * @param {Object} data - Données à valider
 * @param {Object} rules - Règles de validation
 * @param {string} [parentField=''] - Champ parent pour les messages d'erreur imbriqués
 * @returns {Array} - Tableau d'erreurs
 */
const validateObject = (data, rules, parentField = '', checkRequired = true) => {
  const errors = [];
  const prefix = parentField ? `${parentField}.` : '';

  // Vérifier les champs obligatoires
  for (const [field, fieldRules] of Object.entries(rules)) {
    const fullField = `${prefix}${field}`;

    if (checkRequired && fieldRules.required && (data[field] === undefined || data[field] === null || data[field] === '')) {
      errors.push({
        field: fullField,
        message: `Le champ "${fullField}" est requis`,
      });
    }
  }

  // Vérifier les champs fournis
  for (const field in data) {
    const fieldRules = rules[field];
    const fullField = `${prefix}${field}`;

    if (!fieldRules) {
      errors.push({
        field: fullField,
        message: `Champ non autorisé : ${fullField}`,
      });
      continue;
    }

    const value = data[field];
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    // Vérifier le type
    if (actualType !== fieldRules.type) {
      errors.push({
        field: fullField,
        message: `Type invalide pour "${fullField}": attendu "${fieldRules.type}", reçu "${actualType}"`,
      });
      continue;
    }

    // Vérifier les valeurs autorisées
    if (fieldRules.allowedValues && !fieldRules.allowedValues.includes(value)) {
      errors.push({
        field: fullField,
        message: `Valeur invalide pour "${fullField}": doit être l'un de [${fieldRules.allowedValues.join(', ')}]`,
      });
    }

    // Validation récursive pour les objets imbriqués
    if (fieldRules.properties && value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedErrors = validateObject(value, fieldRules.properties, fullField);
      errors.push(...nestedErrors);
    }
  }

  return errors;
};

/**
 * Valide les données d'une commande
 * @param {Object} data - Données à valider
 * @param {boolean} [checkRequired=true] - Si true, vérifie les champs obligatoires
 * @param {boolean} [formatErrors=false] - Si true, retourne une chaîne formatée des erreurs
 * @returns {Array|string|boolean} - Tableau d'erreurs, chaîne formatée ou false si pas d'erreur
 */
exports.validateOrder = (data, checkRequired = true, formatErrors = true) => {
  // Valider d'abord la structure de base
  const errors = validateObject(data, OrderFields, '', checkRequired);

  // Validation personnalisée pour le champ delivery
  if (data.delivery) {
    const { status, type, time } = data.delivery;

    // Si delivery.status est true, vérifier que le type est fourni
    if (status === true && !type) {
      errors.push({
        field: 'delivery.type',
        message: 'Le type de livraison est requis lorsque la livraison est activée',
      });
    }

    // Si le type est 'time', vérifier que l'heure est fournie et au bon format
    if (type === 'time') {
      if (!time) {
        errors.push({
          field: 'delivery.time',
          message: "L'heure de livraison est requise pour une livraison programmée",
        });
      } else if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        errors.push({
          field: 'delivery.time',
          message: "Format d'heure invalide. Utilisez le format HH:MM (ex: 14:30)",
        });
      }
    }

    // Si le type est 'express', s'assurer qu'aucune heure n'est fournie
    if (type === 'express' && time) {
      errors.push({
        field: 'delivery.time',
        message: 'Une heure de livraison ne doit pas être fournie pour une livraison express',
      });
    }
  }

  // Retourner le résultat au format demandé
  if (errors.length === 0) {
    return false;
  }

  return formatErrors ? errors.map(err => `${err.field}: ${err.message}`).join('; ') : errors;
};
