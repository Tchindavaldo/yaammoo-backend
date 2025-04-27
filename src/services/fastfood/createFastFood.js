const { admin, db } = require('../../config/firebase');
const { validateFastfood } = require('../../utils/validator/validateFastfood');

const createFastfood = async data => {
  const errors = validateFastfood(data);
  if (errors.length > 0) {
    const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
    const error = new Error(`Erreur de validation: ${formattedErrors}`);
    error.code = 400;
    throw error;
  }

  const fastfoodData = { ...data, createdAt: new Date() };
  const docRef = await db.collection('fastfoods').add(fastfoodData);
  const dataFinal = { id: docRef.id, ...fastfoodData };
  return dataFinal;
};

module.exports = createFastfood;
