// ============================================================================
// createFastfoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateFastfood } = require('../../utils/validator/validateFastfood');
const { validateDeliveryZones } = require('../pricing/menuPriceGuard');
const { sanitizeDeliveryHours, sanitizeExpressZones } = require('../../utils/deliveryHoursSanitize');
const { getPricingSettings } = require('../settings/settings.service');

exports.createFastfoodService = async data => {
  const io = getIO();
  const errors = validateFastfood(data);
  if (errors.length > 0) {
    const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }

  // Plafond des zones (`fastfood_min_covered_course`), comme a la mise a jour
  // (`updateFastFood.js`) : une course plus chere n'est plus couverte par le
  // surplus d'arrondi du plat. Refuse AVANT ecriture.
  // Même nettoyage qu'à la mise à jour : créneaux PÉRIODIQUES seuls, et une
  // liste EXPRESS sans heure (migration 073).
  if (data.deliveryHours !== undefined) data.deliveryHours = sanitizeDeliveryHours(data.deliveryHours);
  if (data.expressZones !== undefined) data.expressZones = sanitizeExpressZones(data.expressZones);
  if (data.deliveryHours !== undefined || data.expressZones !== undefined) {
    const zoneErrors = validateDeliveryZones(data.deliveryHours, await getPricingSettings(), data.expressZones);
    if (zoneErrors.length > 0) {
      const error = new Error(zoneErrors.map(e => e.message).join(' '));
      error.code = 400;
      throw error;
    }
  }

  // Vérification d'unicité par userId
  const existing = await repos.fastfoods.getByUserId(data.userId);
  if (existing) {
    const error = new Error('Cet utilisateur possède déjà un fastfood.');
    error.code = 400;
    throw error;
  }

  const dataFinal = await repos.fastfoods.create(data);

  await repos.users.updateUser(data.userId, { fastFoodId: dataFinal.id, isMarchand: true });

  io.emit('newFastfood', { message: 'Nouveau fastfood', fastFood: dataFinal });
  return dataFinal;
};
