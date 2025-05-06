const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateFastfood } = require('../../utils/validator/validateFastfood');
const { getUserById, updateUser } = require('../user/userService');

exports.createFastfoodService = async data => {
  const io = getIO();
  const errors = validateFastfood(data);
  if (errors.length > 0) {
    const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }
  const fastfoodData = { ...data, createdAt: new Date().toISOString() };
  const docRef = await db.collection('fastfoods').add(fastfoodData);

  const user = await getUserById(fastfoodData.userId);
  await updateUser(fastfoodData.userId, { fastFoodId: docRef.id });

  const dataFinal = { id: docRef.id, ...fastfoodData };
  io.emit('newFastfood', { message: 'Nouveau fastfood', fastFood: dataFinal });

  return dataFinal;
};
