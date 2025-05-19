// utils/validateOrderUpdate.js
const { menuFields } = require('../../interface/menuFields');

/**
 * Valide les données d'un menu
 * @param {Object} data - Les données à valider
 * @param {boolean} checkRequired - Si true, vérifie les champs obligatoires (par défaut: true)
 * @param {boolean} formatErrors - Si true, retourne une chaîne formatée des erreurs, sinon retourne un tableau d'erreurs (par défaut: false)
 * @returns {Array|string} - Liste des erreurs de validation ou chaîne formatée
 */
exports.validateMenu = (data, checkRequired = true, formatErrors = false) => {
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

    // Cas particulier : validation des éléments dans le tableau `images`
    if (field === 'images') {
      if (!Array.isArray(data.images)) {
        errors.push({
          field: 'images',
          message: `"images" doit être un tableau`,
        });
      } else if (data.images.length < 3 && checkRequired) {
        // Vérifier le nombre minimum d'images uniquement lors de la création (checkRequired = true)
        errors.push({
          field: 'images',
          message: `Le tableau "images" doit contenir au moins 3 images`,
        });
      } else if (data.images.length > 0) {
        // Vérifier le type des images seulement si le tableau n'est pas vide
        data.images.forEach((item, index) => {
          if (typeof item !== 'string') {
            errors.push({
              field: `images[${index}]`,
              message: `Chaque élément de "images" doit être une chaîne de caractères (URL)`,
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

  // Vérifier que tous les champs requis sont présents (seulement si checkRequired est true)
  if (checkRequired) {
    for (const requiredField in menuFields) {
      if (menuFields[requiredField].required && !(requiredField in data)) {
        errors.push({
          field: requiredField,
          message: `Champ obligatoire manquant : ${requiredField}`,
        });
      }
    }
  }

  // Si formatErrors est true, retourner une chaîne formatée uniquement s'il y a des erreurs
  // Sinon, retourner null pour indiquer qu'il n'y a pas d'erreurs
  if (formatErrors) {
    return errors.length > 0 ? errors.map(err => `${err.field}: ${err.message}`).join(', ') : null;
  }
  
  return errors;
};
