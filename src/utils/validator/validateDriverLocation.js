const { driverLocationFields } = require('../../interface/driverLocationFields');
const { validateFieldRules } = require('./validateFieldRules');

/** Vérifie une position de livreur (`POST /driver/location`). */
exports.validateDriverLocation = data => validateFieldRules(driverLocationFields, data);
