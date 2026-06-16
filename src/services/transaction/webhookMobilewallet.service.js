const { getIO } = require('../../socket');
const repos = require('../../repositories');
const { createOrderService } = require('../order/createOrder');

const log = console;

/**
 * Traite un verdict de paiement MobileWallet.
 *
 * ⚠️ APPELÉ PAR LES DEUX CANAUX :
 *   - le webhook HTTP   (webhookMobilewallet.controller → source='webhook')
 *   - le socket entrant (mobilewalletSocketClient        → source='socket')
 * MobileWallet envoie le verdict par les deux en parallèle. Ce service est le
 * point de convergence : peu importe le canal qui arrive en premier.
 *
 * IDEMPOTENCE GARANTIE :
 *   - reserveSettlement réserve atomiquement le verdict (UNIQUE en BD)
 *   - le 1er canal arrivé réserve et traite ; le 2e est détecté comme doublon → skip
 *
 * FLUX :
 *   1. Retrouve le contexte de commande (Supabase pending_payments)
 *   2. Réserve le verdict (atomique) — un seul canal continue
 *   3. Émet socket payment.settled vers le client
 *   4. Si successful → confirme la commande via createOrderService
 */
exports.webhookMobilewalletService = async (payload, source = 'webhook') => {
  const { data } = payload;
  const { transaction_id, status, end_user_ref, amount } = data;

  const logPrefix = `[Verdict MobileWallet:${source}] tx=${transaction_id}`;

  try {
    log.info(`${logPrefix} → Verdict reçu: status=${status}, amount=${amount}`);

    // ========================================================================
    // 1. Retrouver le contexte persisté (Supabase)
    // ========================================================================
    let ctx = await repos.pendingPayments.getById(transaction_id);

    // Fallback : MobileWallet peut renvoyer un tx_id différent → chercher par user
    if (!ctx && end_user_ref) {
      ctx = await repos.pendingPayments.getLatestByUser(end_user_ref);
    }

    if (!ctx) {
      log.error(`${logPrefix} ❌ Contexte introuvable (tx_id=${transaction_id}, userId=${end_user_ref})`);
      return;
    }

    const { userId, orderId, fastFoodId, items, orderCtx } = ctx;
    log.info(`${logPrefix} userId=${userId}, orderId=${orderId}`);

    // ========================================================================
    // 2. Réserver le verdict (atomique) — garantit un seul traitement
    // ========================================================================
    log.info(`${logPrefix} Tentative réservation du verdict en BD...`);
    const reserved = await repos.transactions.reserveSettlement(transaction_id, source, status);

    if (!reserved) {
      const other = source === 'socket' ? 'webhook' : 'socket';
      log.warn(`${logPrefix} ✓ Verdict déjà traité par ${other} → skip`);
      return;
    }
    log.info(`${logPrefix} ✓ Réservation réussie (${source} = premier chemin)`);

    // ========================================================================
    // 3. Émettre socket vers le frontend
    // ========================================================================
    const io = getIO();
    // ⚠️ Le frontend rejoint la room `userId` SANS préfixe (socket.js: join_user
    // → socket.join(userId)). Tout le reste du code émet aussi vers io.to(userId).
    // On garde la même convention ici, sinon le client ne reçoit jamais le verdict.
    log.info(`${logPrefix} → Émission socket payment.settled vers ${userId}`);
    io.to(userId).emit('payment.settled', {
      status,
      transaction_id,
      amount,
      source,
    });
    log.info(`${logPrefix} ✓ Socket émis`);

    // ========================================================================
    // 4. Si succès : confirmer la commande via le service existant
    // ========================================================================
    if (status === 'successful') {
      const order = orderCtx || (orderId && fastFoodId && items
        ? { id: orderId, userId, fastFoodId, items }
        : null);

      if (!order) {
        log.warn(`${logPrefix} ⚠️ Contexte commande incomplet → commande non créée (orderId=${orderId}, fastFoodId=${fastFoodId}, items=${!!items})`);
      } else {
        try {
          log.info(`${logPrefix} status=successful → Création/confirmation commande pour ${userId}`);
          const created = await createOrderService({ ...order, userId });
          if (created?.error) {
            log.error(`${logPrefix} ❌ createOrderService a renvoyé une erreur: ${created.error}`);
          } else {
            log.info(`${logPrefix} ✓ Commande confirmée (id=${created?.id || order.id})`);
          }
        } catch (e) {
          log.error(`${logPrefix} ❌ Erreur création commande: ${e.message}`);
        }
      }
    }

    // Marquer le pending_payment comme réglé (audit / purge ultérieure)
    try {
      await repos.pendingPayments.markSettled(ctx.mwTransactionId || transaction_id, status);
    } catch (e) {
      log.warn(`${logPrefix} markSettled non critique: ${e.message}`);
    }

    log.info(`${logPrefix} ✓ Verdict traité avec succès`);
  } catch (error) {
    log.error(`${logPrefix} ❌ Erreur traitement verdict: ${error.message}`, error);
    // Ne pas relancer (controller/socket capturent déjà)
  }
};
