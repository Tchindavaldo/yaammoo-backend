// ============================================================================
// updateFastFoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');

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
  if (data.pickupOnly !== undefined) updateData.pickupOnly = data.pickupOnly;
  if (data.cities !== undefined) updateData.cities = data.cities;
  if (data.deliveryHours !== undefined) updateData.deliveryHours = data.deliveryHours;

  const updated = await repos.fastfoods.update(fastFoodId, updateData);

  getIO().emit('fastfoodUpdated', { message: 'Fastfood mis à jour', fastFood: updated });

  return updated;
};
