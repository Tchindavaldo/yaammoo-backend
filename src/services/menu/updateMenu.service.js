// ============================================================================
// updateMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateMenu } = require('../../utils/validator/validatMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateMenuService = async (menuId, updateData) => {
  if (!menuId) return { success: false, message: 'ID du menu est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return { success: false, message: 'Format de données invalide pour la mise à jour' };
  }

  const errors = validateMenu(updateData, false, true);
  if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour du menu: ${errors}` };

  try {
    const existing = await repos.menus.getById(menuId);
    if (!existing) return { success: false, message: 'Menu non trouvé' };

    const updatedMenu = await repos.menus.update(menuId, updateData);

    const fastFood = await getFastFoodService(existing.fastFoodId);
    const userId = fastFood.userId;

    const io = getIO();
    io.emit('globalMenuUpdated', { message: 'Menu mis à jour', menuId, menu: updatedMenu });
    io.to(userId).emit('fastFoodMenuUpdated', { message: 'Menu mis à jour', menuId, menu: updatedMenu });

    return { success: true, message: 'Menu mis à jour avec succès', data: updatedMenu };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la mise à jour du menu' };
  }
};
