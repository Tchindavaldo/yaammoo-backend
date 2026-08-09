// ============================================================================
// updateFastFoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { sanitizeDeliveryHours } = require('../../utils/deliveryHoursSanitize');
const { validateDeliveryZones } = require('../pricing/menuPriceGuard');
const { getPricingSettings } = require('../settings/settings.service');

exports.updateFastFoodService = async (fastFoodId, data) => {
  const existing = await repos.fastfoods.getById(fastFoodId);
  if (!existing) {
    const error = new Error('Fastfood non trouvé');
    error.code = 404;
    throw error;
  }

  // Whitelist des champs autorisés à la mise à jour
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.number !== undefined) updateData.number = data.number;
  if (data.momoNumber !== undefined) updateData.momoNumber = data.momoNumber;
  if (data.whatsappNumber !== undefined) updateData.whatsappNumber = data.whatsappNumber;
  if (data.openTime !== undefined) updateData.openTime = data.openTime;
  if (data.closeTime !== undefined) updateData.closeTime = data.closeTime;
  if (data.image !== undefined) updateData.image = data.image;
  if (data.orderLeadTime !== undefined) updateData.orderLeadTime = data.orderLeadTime;
  if (data.advanceDays !== undefined) updateData.advanceDays = data.advanceDays;
  if (data.pickupAllowed !== undefined) updateData.pickupAllowed = data.pickupAllowed;
  if (data.cities !== undefined) updateData.cities = data.cities;
  // Le front renvoie ses lignes d'heures vidées (mode actif, zéro zone) : on ne
  // garde que les créneaux réellement exploitables. Voir utils/deliveryHoursSanitize.
  if (data.deliveryHours !== undefined) {
    updateData.deliveryHours = sanitizeDeliveryHours(data.deliveryHours);

    // Une zone trop chère n'est plus absorbée par le surplus d'arrondi du plat :
    // la commission prélevée dessus sortirait de la marge. Refusé AVANT écriture.
    const zoneErrors = validateDeliveryZones(updateData.deliveryHours, await getPricingSettings());
    if (zoneErrors.length > 0) {
      const error = new Error(zoneErrors.map(e => e.message).join(' '));
      error.code = 400;
      throw error;
    }
  }

  const updated = await repos.fastfoods.update(fastFoodId, updateData);

  getIO().emit('fastfoodUpdated', { message: 'Fastfood mis à jour', fastFood: updated });

  return updated;
};
