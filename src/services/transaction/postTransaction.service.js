// ============================================================================
// postTransactionService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateTransactionCreation } = require('../../utils/validator/validateTransactionCreation');
const mobilewalletService = require('./mobilewalletService');

// Cache en mémoire : mw_transaction_id → userId (pour le webhook)
const mwTransactionMap = new Map();

exports.postTransactionService = async (data) => {
  const io = getIO();
  const errors = validateTransactionCreation(data);
  if (errors.length > 0) return { success: false, message: errors };

  const { amount, currentAmount, payBy, userId, phone, email } = data;

  // remainingAmount calculé si paiement mobileApp partiel
  if (payBy === 'mobileApp' && amount < currentAmount) {
    data.remainingAmount = +(currentAmount - amount).toFixed(2);
  }

  // Appel Mobile Money si payBy === 'mobilemoney'
  if (payBy === 'mobilemoney') {
    const network = data.network || 'Orangemoney';
    const mwResult = await mobilewalletService.pay({
      amount,
      phone,
      network,
      email,
      userId,
    });

    if (!mwResult.success) {
      return {
        success: false,
        message: mwResult.message,
        code: mwResult.code,
        retry_after_s: mwResult.retry_after_s,
      };
    }

    // Réponse immédiate au frontend : ussd_sent (asynchrone)
    const mw_transaction_id = mwResult.transaction_id;
    mwTransactionMap.set(mw_transaction_id, userId);

    return {
      success: true,
      status: mwResult.status, // 'ussd_sent'
      message: mwResult.message,
      mw_transaction_id,
      data: {
        status: mwResult.status,
        mw_transaction_id,
      },
    };
  }

  // Chemin normal (paiement non Mobile Money)
  const transaction = await repos.transactions.create(data);
  io.to(data.userId).emit('newTransaction', { message: 'nouvelle transaction', data: transaction });
  return { success: true, data: transaction, message: 'transaction ajoutée avec succès' };
};

// Exporter la map pour le webhook
exports.getMwTransactionMap = () => mwTransactionMap;
