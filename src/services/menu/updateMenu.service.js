const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateMenu } = require('../../utils/validator/validatMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.updateMenuService = async (menuId, updateData) => {
  if (!menuId) return { success: false, message: 'ID du menu est requis' };
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) return { success: false, message: 'Format de données invalide pour la mise à jour' };

  const errors = validateMenu(updateData, false, true);
  if (errors) return { success: false, message: `Erreur de validation lors de la mise à jour du menu: ${errors}` };

  try {
    const menuRef = db.collection('menus').doc(menuId);
    const menuDoc = await menuRef.get();

    if (!menuDoc.exists) return { success: false, message: 'Menu non trouvé' };

    const menuData = menuDoc.data();
    const fastFoodId = menuData.fastFoodId;

    const updatedFields = { ...updateData };

    await menuRef.update({ ...updatedFields, updatedAt: new Date().toISOString() });

    const updatedMenuDoc = await menuRef.get();
    const updatedMenu = { id: updatedMenuDoc.id, ...updatedMenuDoc.data() };

    // Récupérer le fastFood pour obtenir le userId
    const fastFood = await getFastFoodService(fastFoodId);
    const userId = fastFood.userId;

    const io = getIO();
    io.emit('globalMenuUpdated', { message: 'Menu mis à jour', menuId: menuId, menu: updatedMenu });
    io.to(userId).emit('fastFoodMenuUpdated', { message: 'Menu mis à jour', menuId: menuId, menu: updatedMenu });

    return { success: true, message: 'Menu mis à jour avec succès', data: updatedMenu };
  } catch (error) {
    console.error('Erreur dans updateMenuService:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour du menu',
    };
  }
};
