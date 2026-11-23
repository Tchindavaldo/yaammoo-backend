// ============================================================================
// updateFastFoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { sanitizeDeliveryHours, sanitizeExpressZones } = require('../../utils/deliveryHoursSanitize');
const { validateDeliveryZones } = require('../pricing/menuPriceGuard');
const { getPricingSettings } = require('../settings/settings.service');
const { purgeUnusedImages } = require('../images/uploadImage.service');
const { sanitizeShopDrinks } = require('../menu/shopDrinks');
const { broadcastFastfoodViews } = require('./fastfoodsChanged');
const { isReservedPhone, reservedError } = require('../whatsapp/reservedPhones');

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
  if (data.whatsappNumber !== undefined) {
    if (await isReservedPhone(data.whatsappNumber)) throw reservedError();
    updateData.whatsappNumber = data.whatsappNumber;
  }
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
  // Position de la boutique (migration 060) : les deux ensemble, ou `null`
  // pour l'effacer. Sert au calcul de distance du home.
  if (data.latitude !== undefined || data.longitude !== undefined) {
    const clear = data.latitude === null && data.longitude === null;
    const valid =
      Number.isFinite(data.latitude) && Math.abs(data.latitude) <= 90 && Number.isFinite(data.longitude) && Math.abs(data.longitude) <= 180;
    if (!clear && !valid) throw badRequest('latitude (±90) et longitude (±180) doivent être fournies ensemble.');
    updateData.latitude = clear ? null : data.latitude;
    updateData.longitude = clear ? null : data.longitude;
  }
  // Boissons de la boutique (migration 062) : liste COMPLÈTE, remplace l'ancienne.
  if (data.drinks !== undefined) {
    updateData.drinks = sanitizeShopDrinks(data.drinks);
    // Qui paie les frais de chaque boisson (money-rules.md §2 bis).
    const { validateDrinkFeePayers } = require('../pricing/feePayer');
    const drinkErrors = validateDrinkFeePayers(updateData.drinks, existing, await getPricingSettings(), existing.drinks);
    if (drinkErrors.length > 0) throw badRequest(drinkErrors.map(e => e.message).join(' '));
  }
  if (data.openDays !== undefined) {
    const valid = Array.isArray(data.openDays) && data.openDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) throw badRequest('openDays doit être un tableau d\'entiers 0 (dimanche) à 6 (samedi).');
    updateData.openDays = [...new Set(data.openDays)].sort((a, b) => a - b);
  }
  // Le front renvoie ses lignes d'heures vidées (mode actif, zéro zone) : on ne
  // garde que les créneaux réellement exploitables. Voir utils/deliveryHoursSanitize.
  if (data.deliveryHours !== undefined) updateData.deliveryHours = sanitizeDeliveryHours(data.deliveryHours);
  // Zones EXPRESS (migration 073) : une liste par boutique, un prix par lieu.
  if (data.expressZones !== undefined) updateData.expressZones = sanitizeExpressZones(data.expressZones);

  // Une zone trop chère n'est plus absorbée par le surplus d'arrondi du plat :
  // la commission prélevée dessus sortirait de la marge. Refusé AVANT écriture.
  if (updateData.deliveryHours !== undefined || updateData.expressZones !== undefined) {
    const zoneErrors = validateDeliveryZones(updateData.deliveryHours, await getPricingSettings(), updateData.expressZones);
    if (zoneErrors.length > 0) {
      const error = new Error(zoneErrors.map(e => e.message).join(' '));
      error.code = 400;
      throw error;
    }
  }

  const updated = await repos.fastfoods.update(fastFoodId, updateData);
  // Image remplacée → l'ancienne part en corbeille (effacée après rétention).
  if (updateData.image !== undefined) await purgeUnusedImages([existing.image], [updated?.image], { entity: 'fastfood', entityId: fastFoodId, field: 'image' });

  // Vue home complète envoyée à toutes les apps (voir fastfoodsChanged.js).
  await broadcastFastfoodViews([fastFoodId], 'fastfood_updated');

  return updated;
};
