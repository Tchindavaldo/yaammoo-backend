const { admin, db } = require('../../config/firebase');
const { getIO } = require('../../socket');
const { validateTransactionCreation } = require('../../utils/validator/validateTransactionCreation');

exports.postTransactionService = async data => {
  const io = getIO();
  const errors = validateTransactionCreation(data);
  if (errors.length > 0) return { success: false, message: errors };

  const { amount, currentAmount, payBy } = data;

  // Ajouter remainingAmount si les conditions sont remplies
  if (payBy === 'mobileApp' && amount < currentAmount) {
    data.remainingAmount = +(currentAmount - amount).toFixed(2); // arrondi à 2 décimales
  }

  const transactionData = {
    ...data,
    createdAt: new Date().toISOString(),
  };

  const docRef = await db.collection('transaction').add(transactionData);
  const docSnap = await docRef.get();
  const transaction = { id: docRef.id, ...docSnap.data() };

  io.to(data.userId).emit('newTransaction', { message: 'nouvelle transaction', data: transaction });
  return { success: true, data: transaction, message: 'transaction ajoutée avec succès' };
};
