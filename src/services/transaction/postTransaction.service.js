// ============================================================================
// postTransactionService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateTransactionCreation } = require('../../utils/validator/validateTransactionCreation');
const mobilewalletService = require('./mobilewalletService');

const log = console;

// Cache en mémoire : mw_transaction_id → userId (pour le webhook)
const mwTransactionMap = new Map();

exports.postTransactionService = async (data) => {
  const io = getIO();
  const { amount, currentAmount, payBy, userId, phone, email, network } = data;

  const logPrefix = `[Transaction] userId=${userId}`;

  try {
    log.info(`${logPrefix} → Création transaction: payBy=${payBy}, amount=${amount}`);

    // Validation
    const errors = validateTransactionCreation(data);
    if (errors.length > 0) {
      log.warn(`${logPrefix} ❌ Validation échouée: ${errors.join(', ')}`);
      return { success: false, message: errors };
    }

    // remainingAmount calculé si paiement mobileApp partiel
    if (payBy === 'mobileApp' && amount < currentAmount) {
      data.remainingAmount = +(currentAmount - amount).toFixed(2);
    }

    // =========================================================================
    // Appel MobileWallet si payBy === 'mobilemoney'
    // =========================================================================
    if (payBy === 'mobilemoney') {
      const networkName = network || 'Orangemoney';
      const callPayloadLog = {
        amount,
        phone,
        network: networkName,
        email,
        userId,
      };

      log.info(
        `${logPrefix} → Appel MobileWallet /pay: amount=${amount}, network=${networkName}, phone=${phone}`
      );

      const startTime = Date.now();
      let mwResult;
      try {
        mwResult = await mobilewalletService.pay({
          amount,
          phone,
          network: networkName,
          email,
          userId,
        });
        const duration = Date.now() - startTime;
        log.info(`${logPrefix} ✓ Réponse MobileWallet reçue en ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - startTime;
        log.error(
          `${logPrefix} ❌ Erreur appel MobileWallet après ${duration}ms: ${error.message}`
        );
        throw error;
      }

      // Vérifier la réponse
      if (!mwResult.success) {
        log.warn(
          `${logPrefix} MobileWallet répondit avec succès=false: code=${mwResult.code}, message=${mwResult.message}`
        );
        return {
          success: false,
          message: mwResult.message,
          code: mwResult.code,
          retry_after_s: mwResult.retry_after_s,
        };
      }

      // Succès: enregistrer la map et retourner
      const mw_transaction_id = mwResult.transaction_id;
      log.info(
        `${logPrefix} ✓ MobileWallet status=${mwResult.status}, transaction_id=${mw_transaction_id}`
      );

      mwTransactionMap.set(mw_transaction_id, userId);
      log.debug(`${logPrefix} Mappé mw_tx=${mw_transaction_id} → userId=${userId}`);

      log.info(`${logPrefix} ✓ Transaction initiée, en attente de webhook/socket`);

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

    // =========================================================================
    // Chemin normal (paiement non Mobile Money)
    // =========================================================================
    log.info(`${logPrefix} Chemin paiement non-MobileWallet (payBy=${payBy})`);
    const transaction = await repos.transactions.create(data);
    log.info(`${logPrefix} ✓ Transaction créée: id=${transaction.id}`);

    io.to(data.userId).emit('newTransaction', {
      message: 'nouvelle transaction',
      data: transaction,
    });
    log.info(`${logPrefix} ✓ Socket newTransaction émis`);

    return {
      success: true,
      data: transaction,
      message: 'transaction ajoutée avec succès',
    };
  } catch (error) {
    log.error(`${logPrefix} ❌ Erreur postTransactionService: ${error.message}`, error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la création de la transaction',
    };
  }
};

// Exporter la map pour le webhook
exports.getMwTransactionMap = () => mwTransactionMap;
