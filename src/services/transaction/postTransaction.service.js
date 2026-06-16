// ============================================================================
// postTransactionService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateTransactionCreation } = require('../../utils/validator/validateTransactionCreation');
const mobilewalletService = require('./mobilewalletService');

const log = console;

exports.postTransactionService = async data => {
  const io = getIO();
  const { amount, currentAmount, payBy, userId, phone, email, network, items } = data;

  const logPrefix = `[Transaction] userId=${userId}`;

  try {
    log.info(`${logPrefix} → Création transaction: payBy=${payBy}, amount=${amount}`);

    // Validation
    const errors = validateTransactionCreation(data);
    if (errors.length > 0) {
      log.warn(`${logPrefix} ❌ Validation échouée:`);
      errors.forEach(err => {
        log.warn(`  - ${err.field}: ${err.message}`);
      });
      return { success: false, httpStatus: 400, message: errors };
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

      // =======================================================================
      // Pré-check stock AVANT de débiter le client (UX : échouer tôt).
      // On somme les quantités par menu.id (gère le même plat en double + les
      // restos différents), puis on compare au stock BRUT du menu.
      // stock === null → menu illimité → on laisse passer (comme le SQL).
      // Le check atomique au verdict (create/update) reste le garde-fou final.
      // =======================================================================
      const qtyByMenu = {};
      for (const it of (Array.isArray(items) ? items : [])) {
        const menuId = it?.menu?.id;
        if (!menuId) continue;
        qtyByMenu[menuId] = (qtyByMenu[menuId] || 0) + (Number(it.quantity) || 1);
      }

      for (const [menuId, qty] of Object.entries(qtyByMenu)) {
        const { exists, stock } = await repos.menus.getRawStock(menuId);
        if (!exists) {
          log.warn(`${logPrefix} ❌ Pré-check stock: menu introuvable (${menuId})`);
          return { success: false, httpStatus: 409, code: 'insufficient_stock', message: `Menu introuvable : ${menuId}` };
        }
        // stock null = illimité → OK
        if (stock !== null && stock < qty) {
          log.warn(`${logPrefix} ❌ Pré-check stock insuffisant: menu=${menuId}, demandé=${qty}, dispo=${stock}`);
          return {
            success: false,
            httpStatus: 409,
            code: 'insufficient_stock',
            message: `Stock insuffisant. Stock disponible : ${stock} (demandé : ${qty})`,
          };
        }
      }
      log.info(`${logPrefix} ✓ Pré-check stock OK (${Object.keys(qtyByMenu).length} menu(s))`);

      log.info(`${logPrefix} → Appel MobileWallet /pay: amount=${amount}, network=${networkName}, phone=${phone}`);

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
        log.error(`${logPrefix} ❌ Erreur appel MobileWallet après ${duration}ms: ${error.message}`);
        throw error;
      }

      // MobileWallet renvoie maintenant un vrai flag `success`.
      // Init OK = success:true + status:'ussd_sent'. Sinon c'est une erreur.
      if (!mwResult.success || mwResult.status === 'error') {
        log.warn(`${logPrefix} MobileWallet erreur: success=${mwResult.success}, code=${mwResult.code}, message=${mwResult.message}`);
        return {
          success: false,
          status: mwResult.status || 'error',
          httpStatus: mwResult.httpStatus || 502,
          message: mwResult.message,
          code: mwResult.code,
          retry_after_s: mwResult.retry_after_s,
          last_status: mwResult.last_status,
        };
      }

      // Succès: persister le contexte de commande pour le verdict
      const mw_transaction_id = mwResult.transaction_id;
      log.info(`${logPrefix} ✓ MobileWallet success=${mwResult.success}, status=${mwResult.status}, transaction_id=${mw_transaction_id}`);

      // Persister le contexte de commande en BD (Supabase) pour le verdict
      // (webhook OU socket). Remplace l'ancienne Map en mémoire — survit aux
      // redémarrages et fonctionne en multi-instance.
      try {
        await repos.pendingPayments.save(mw_transaction_id, {
          userId,
          // items = tableau de commandes complètes, chacune avec son fastFoodId.
          items,
          amount,
          phone,
          network: network || 'Orangemoney',
          email,
        });
        log.debug(`${logPrefix} Contexte persisté mw_tx=${mw_transaction_id} → userId=${userId}, nbCommandes=${Array.isArray(items) ? items.length : 0}`);
      } catch (e) {
        log.error(`${logPrefix} ❌ Échec persistance pending_payment: ${e.message}`);
        throw e;
      }

      log.info(`${logPrefix} ✓ Transaction initiée, en attente de webhook/socket`);

      // On renvoie au frontend la MÊME réponse que MobileWallet (success,
      // status, message, transaction_id, code) + le contexte utile (payment_number).
      return {
        success: mwResult.success,           // true
        status: mwResult.status,             // 'ussd_sent'
        message: mwResult.message,           // "Composez #150*50# ..."
        transaction_id: mw_transaction_id,   // "IN960#260613155908"
        code: mwResult.code,                 // 200
        payment_number: mwResult.payment_number,
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
      httpStatus: 500,
      message: error.message || 'Erreur lors de la création de la transaction',
    };
  }
};
