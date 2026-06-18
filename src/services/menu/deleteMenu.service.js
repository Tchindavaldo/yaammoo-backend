// ============================================================================
// deleteMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { getMenuService } = require('./getMenu.services');
const { reliableEmit } = require('../../utils/reliableEmit');

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
    // Broadcast catalogue public : rechargé par re-fetch à la reconnexion (non persisté).
    io.emit('globalMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId });
    // Ciblé marchand propriétaire : émission fiable (rejouée si hors ligne).
    if (fastFood?.userId) {
      await reliableEmit(io, fastFood.userId, 'fastFoodMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId });
    }

    return { success: true, message: 'Menu supprimé', data: finalData };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la suppression du menu' };
  }
};
