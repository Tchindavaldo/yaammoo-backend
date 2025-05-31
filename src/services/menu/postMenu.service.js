const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateMenu } = require('../../utils/validator/validatMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');

exports.postMenuService = async data => {
  try {
    const io = getIO();
    const errors = validateMenu(data, true, true); // Vérifier les champs obligatoires et formater les erreurs
    if (errors) { // Si errors est une chaîne, cela signifie qu'il y a des erreurs formatées
      return {
        success: false,
        message: `Erreur de validation lors de la création du menu: ${errors}`,
        data: null
      };
    }

    const menuData = { ...data, createdAt: new Date().toISOString() };

    const docRef = await db.collection('menus').add(menuData);
    const menuAdded = { ...menuData, id: docRef.id };
    
    // Récupérer le fastFood pour obtenir le userId
    const fastFood = await getFastFoodService(menuData.fastFoodId);
    const userId = fastFood.userId;
    
    io.emit('newGlobalMenu', { message: 'Nouveau menu', menu: menuAdded });
    io.to(userId).emit('newFastFoodMenu', { message: 'Nouveau menu', menu: menuAdded });

    return {
      success: true,
      message: 'Menu ajouté avec succès',
      data: menuAdded
    };
  } catch (error) {
    // console.error('Erreur dans postMenuService:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la création du menu',
      data: null
    };
  }
};
