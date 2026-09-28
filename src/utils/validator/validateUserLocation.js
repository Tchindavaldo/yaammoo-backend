const { userLocationFields } = require('../../interface/userLocationFields');
const { validateFieldRules } = require('./validateFieldRules');

/**
 * Vérifie une position envoyée par l'app : champs autorisés, requis, types,
 * bornes, valeurs permises. Retourne `errors[]` (vide = valide).
 */
exports.validateUserLocation = data => validateFieldRules(userLocationFields, data);
