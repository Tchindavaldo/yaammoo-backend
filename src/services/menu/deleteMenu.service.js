// ============================================================================
// deleteMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { getMenuService } = require('./getMenu.services');

exports.deleteMenuService = async (menuId) => {
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
    io.emit('globalMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId });
    io.to(fastFood.userId).emit('fastFoodMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId });

    return { success: true, message: 'Menu supprimé', data: finalData };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la suppression du menu' };
  }
};
