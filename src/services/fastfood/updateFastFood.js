// ============================================================================
// updateFastFoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { sanitizeDeliveryHours } = require('../../utils/deliveryHoursSanitize');
const { validateDeliveryZones } = require('../pricing/menuPriceGuard');
const { getPricingSettings } = require('../settings/settings.service');
const { purgeUnusedImages } = require('../images/uploadImage.service');

const badRequest = message => Object.assign(new Error(message), { code: 400 });

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
  if (data.isAvailable !== undefined) {
    if (typeof data.isAvailable !== 'boolean') throw badRequest('isAvailable doit être un booléen.');
    updateData.isAvailable = data.isAvailable;
  }
  if (data.openDays !== undefined) {
    const valid = Array.isArray(data.openDays) && data.openDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) throw badRequest('openDays doit être un tableau d\'entiers 0 (dimanche) à 6 (samedi).');
    updateData.openDays = [...new Set(data.openDays)].sort((a, b) => a - b);
  }
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
  // Image remplacée → l'ancienne est effacée du storage.
  if (updateData.image !== undefined) await purgeUnusedImages([existing.image], [updated?.image]);

  getIO().emit('fastfoodUpdated', { message: 'Fastfood mis à jour', fastFood: updated });

  return updated;
};
