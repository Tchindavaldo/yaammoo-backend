// services/order/getOrdersService.js
const { db } = require('../../config/firebase');
const { getMenuService } = require('../menu/getMenu.services');

exports.getFastFoodsService = async () => {
  try {
    const fastfoodSnapshot = await db.collection('fastfoods').get();
    if (fastfoodSnapshot.empty) return [];

    const fastfoodsWithMenus = await Promise.all(
      fastfoodSnapshot.docs.map(async doc => {
        const fastfood = { id: doc.id, ...doc.data() };
        const menus = await getMenuService(fastfood.id);
        return { ...fastfood, menus };
      })
    );

    // Filtrer pour ne retourner que les fastfoods avec au moins un menu
    const filteredFastfoods = fastfoodsWithMenus.filter(fastfood => Array.isArray(fastfood.menus) && fastfood.menus.length > 0);

    return filteredFastfoods;
  } catch (error) {
    console.error('Erreur dans getFastfood:', error);
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
