// ============================================================================
// deleteMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { getMenuService } = require('./getMenu.services');
const { reliableEmit } = require('../../utils/reliableEmit');
const { getPricingSettings } = require('../settings/settings.service');
const { applyDisplayPricing } = require('../pricing/deliveryPricing');

exports.deleteMenuService = async menuId => {
  if (!menuId) return { success: false, message: 'ID du menu est requis' };

  try {
    const existing = await repos.menus.getById(menuId);
    if (!existing) return { success: false, message: 'Menu non trouvé' };

    const fastFoodId = existing.fastFoodId;
    await repos.menus.delete(menuId);

    const fastFood = await getFastFoodService(fastFoodId);
    const updatedMenus = await getMenuService(fastFoodId);
    const finalData = { ...fastFood, menus: { ...updatedMenus } };

    const io = getIO();
    // Broadcast catalogue public (CLIENT) : prix AFFICHÉ. On enrichit la boutique
    // avec ses menus restants (en tableau) — livraison + marge + frais inclus.
    const pricing = await getPricingSettings();
    const clientData = applyDisplayPricing({ ...fastFood, menus: Array.isArray(updatedMenus) ? updatedMenus : Object.values(updatedMenus) }, pricing, false);
    io.emit('globalMenuDeleted', { message: 'Menu supprimé', fastFood: clientData, menuId });
    // Ciblé marchand propriétaire : prix BRUT (il gère son catalogue). Fiable.
    if (fastFood?.userId) {
      await reliableEmit(io, fastFood.userId, 'fastFoodMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId });
    }

    return { success: true, message: 'Menu supprimé', data: finalData };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la suppression du menu' };
  }
};
