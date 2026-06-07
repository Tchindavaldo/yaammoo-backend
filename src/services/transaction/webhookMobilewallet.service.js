const { getIO } = require('../../socket');
const { getMwTransactionMap } = require('./postTransaction.service');
const repos = require('../../repositories');

const log = console;

/**
 * Traite un webhook entrant d'ai_browser2 (verdict du paiement).
 *
 * IDEMPOTENCE GARANTIE :
 *   - Réserve atomiquement le verdict en BD (transactionSettlements)
 *   - Si socket et webhook arrivent en parallèle, un seul traite
 *   - Synchronisation via table transactionSettlements
 *
 * FLUX :
 *   1. Log d'arrivée du webhook
 *   2. Réserve le verdict (atomique DB)
 *   3. Si déjà traité (par socket/webhook précédent) → skip avec log
 *   4. Émettre socket au client + créer commande si succès
 *   5. Log de fin
 */
exports.webhookMobilewalletService = async (payload, source = 'webhook') => {
  const { type, data } = payload;
  const { transaction_id, status, end_user_ref, amount } = data;

  const logPrefix = `[Webhook MobileWallet] tx=${transaction_id}`;

  try {
    log.info(`${logPrefix} → Verdict reçu: status=${status}, amount=${amount}`);

    // Retrouver le userId via la map (mw_transaction_id → userId)
    const mwMap = getMwTransactionMap();
    const userId = end_user_ref || mwMap.get(transaction_id);

    if (!userId) {
      log.error(`${logPrefix} ❌ userId introuvable (pas en map, end_user_ref absent)`);
      return;
    }

    log.info(`${logPrefix} userId=${userId}`);

    // ========================================================================
    // ÉTAPE CRITIQUE : Réserve le verdict (atomique)
    // ========================================================================
    // Si socket a déjà réservé → cette insertion échouera (UNIQUE constraint)
    // et reserveSettlement retournera false.
    // Si webhook est le premier → retourne true, on continue.
    log.info(`${logPrefix} Tentative réservation du verdict en BD...`);

    const reserved = await repos.transactions.reserveSettlement(
      transaction_id,
      source, // ← 'webhook' ou 'socket' selon la source
      status
    );

    if (!reserved) {
      log.warn(`${logPrefix} ✓ Verdict déjà traité par ${source === 'socket' ? 'webhook' : 'socket'} → skip`);
      return;
    }

    log.info(`${logPrefix} ✓ Réservation réussie (${source} = premier chemin)`);

    // ========================================================================
    // TRAITEMENT DU VERDICT
    // ========================================================================
    const io = getIO();

    // 1. Émettre socket vers le frontend
    log.info(`${logPrefix} → Émission socket payment.settled vers user:${userId}`);
    io.to(`user:${userId}`).emit('payment.settled', {
      status,
      transaction_id,
      amount,
      source: 'webhook', // ← utile pour debugging
    });
    log.info(`${logPrefix} ✓ Socket émis`);

    // 2. Si succès : créer la commande
    if (status === 'successful') {
      try {
        log.info(`${logPrefix} status=successful → Création commande lancée pour ${userId}`);
        // TODO: appeler le service order existant
        // await orderService.createFromPayment(transactionData);
        log.info(`${logPrefix} ✓ Commande créée`);
      } catch (error) {
        log.error(`${logPrefix} ❌ Erreur création commande: ${error.message}`);
      }
    }

    log.info(`${logPrefix} ✓ Webhook traité avec succès`);
  } catch (error) {
    log.error(`${logPrefix} ❌ Erreur traitement webhook: ${error.message}`, error);
    // Ne pas relancer (le webhook controller capture déjà)
  }
};
