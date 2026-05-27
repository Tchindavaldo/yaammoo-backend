// ============================================================================
// postTransactionService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateTransactionCreation } = require('../../utils/validator/validateTransactionCreation');

exports.postTransactionService = async (data) => {
  const io = getIO();
  const errors = validateTransactionCreation(data);
  if (errors.length > 0) return { success: false, message: errors };

  const { amount, currentAmount, payBy } = data;

  // remainingAmount calculé si paiement mobileApp partiel
  if (payBy === 'mobileApp' && amount < currentAmount) {
    data.remainingAmount = +(currentAmount - amount).toFixed(2);
  }

  const transaction = await repos.transactions.create(data);

  io.to(data.userId).emit('newTransaction', { message: 'nouvelle transaction', data: transaction });
  return { success: true, data: transaction, message: 'transaction ajoutée avec succès' };
};
