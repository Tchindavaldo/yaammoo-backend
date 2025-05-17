const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validatePostMenu } = require('../../utils/validator/validatePostMenu');
const { getFastFoodService } = require('../fastfood/getFastFood');
const { getMenuService } = require('./getMenu.services');

exports.postMenuService = async data => {
  const io = getIO();
  const errors = validatePostMenu(data);
  if (errors.length > 0) {
    const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }

  const menuData = { ...data, createdAt: new Date().toISOString() };
  const fastFood = await getFastFoodService(menuData.fastFoodId);

  const docRef = await db.collection('menus').add(menuData);
  const fastFoodMenu = await getMenuService(fastFood.id);
  const finalData = { ...fastFood, menus: { ...fastFoodMenu, fastFoodId: fastFood.id } };
  io.emit('newMenu', { message: 'Nouveau menu', fastFood: finalData, menu: finalData.menus });

  return finalData;
};
