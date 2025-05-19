const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { getMenuService } = require('./getMenu.services');

exports.deleteMenuService = async menuId => {
  if (!menuId) return { success: false, message: 'ID du menu est requis' };

  try {
    // Récupérer le menu avant de le supprimer pour obtenir le fastFoodId
    const menuRef = db.collection('menus').doc(menuId);
    const menuDoc = await menuRef.get();

    if (!menuDoc.exists) return { success: false, message: 'Menu non trouvé' };

    const menuData = menuDoc.data();
    const fastFoodId = menuData.fastFoodId;

    // Supprimer le menu
    await menuRef.delete();

    // Récupérer les données mises à jour pour la réponse
    const fastFood = await getFastFoodService(fastFoodId);
    const updatedMenus = await getMenuService(fastFoodId);
    const finalData = { ...fastFood, menus: { ...updatedMenus } };

    // Émettre un événement via socket.io
    const io = getIO();
    io.emit('globalMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId: menuId });
    io.to(fastFood.userId).emit('fastFoodMenuDeleted', { message: 'Menu supprimé', fastFood: finalData, menuId: menuId });

    return { success: true, message: 'Menu supprimé', data: finalData };
  } catch (error) {
    console.error('Erreur dans deleteMenuService:', error);
    return { success: false, message: error.message || 'Erreur lors de la suppression du menu' };
  }
};
