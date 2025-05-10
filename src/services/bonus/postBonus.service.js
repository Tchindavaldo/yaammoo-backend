const { admin, db } = require('../../config/firebase');

exports.postBonusService = async data => {
  // const io = getIO();
  // const errors = validateFastfood(data);
  // if (errors.length > 0) {
  //   const formattedErrors = errors.map(err => `${err.field}: ${err.message}`).join(', ');
  //   const error = new Error(`Erreur de validation: ${formattedErrors}`);
  //   error.code = 400;
  //   throw error;
  // }
  const bonusData = { ...data, createdAt: new Date().toISOString() };
  const docRef = await db.collection('bonus').add(data);

  // io.emit('newbonus', { message: 'Nouveau bonus', data: docRef });

  return bonusData;
};
