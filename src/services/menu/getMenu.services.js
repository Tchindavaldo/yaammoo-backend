// services/order/getmenumenuService.js
const { db } = require('../../config/firebase');

exports.getMenuService = async fastfoodfId => {
  try {
    const menuSnapshot = await db.collection('menus').where('fastfoodId', '==', fastfoodfId).orderBy('createdAt', 'desc').get();
    if (menuSnapshot.empty) return [];
    return menuSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    // console.error('Erreur dans get/MenuService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des menu');
  }
};
