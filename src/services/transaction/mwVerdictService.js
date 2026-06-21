const { getIO } = require('../../socket');
const repos = require('../../repositories');
const { createOrderService } = require('../order/createOrder');
const { updateOrders } = require('../order/updateOrders.service');
const { creditMerchantForItem } = require('./creditMerchant.service');
const { reliableEmit } = require('../../utils/reliableEmit');
const { webhookPayoutVerdict } = require('./webhookPayout.service');

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
exports.mwVerdictService = async (payload, source = 'webhook') => {
  const { data } = payload;
  const { transaction_id, status, end_user_ref, amount, network } = data;

  const logPrefix = `[Verdict MobileWallet:${source}] tx=${transaction_id}`;

  try {
    log.info(`${logPrefix} → Verdict reçu: status=${status}, amount=${amount}`);

    // ========================================================================
    // 0. Routage RETRAIT (payout) : ce verdict concerne-t-il un withdrawal ?
    // ========================================================================
    const withdrawal = await repos.withdrawals.getByPayoutId(transaction_id);
    if (withdrawal) {
      log.info(`${logPrefix} → Verdict de RETRAIT (withdrawalId=${withdrawal.id})`);
      await webhookPayoutVerdict(withdrawal, data, source);
      return;
    }

    // ========================================================================
    // 1. Retrouver le contexte persisté (Supabase) — flux PAIEMENT
    // ========================================================================
    // `end_user_ref` = le paymentRef UNIQUE qu'on a envoyé à l'init. MobileWallet
    // nous le renvoie tel quel → lookup DÉTERMINISTE, pas de fallback/devinette.
    const ctx = end_user_ref ? await repos.pendingPayments.getByRef(end_user_ref) : null;

    if (!ctx) {
      log.error(`${logPrefix} ❌ Contexte introuvable (end_user_ref=${end_user_ref}, tx_id=${transaction_id})`);
      return;
    }

    const { userId, items } = ctx;
    log.info(`${logPrefix} userId=${userId}, nbCommandes=${Array.isArray(items) ? items.length : 0}`);

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
    await reliableEmit(io, userId, 'payment.settled', {
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
      // `items` = tableau d'objets-commande complets, chacun avec son fastFoodId.
      // Routage par item (les deux services existaient avant le module paiement) :
      //   - item AVEC `id` → commande déjà en base (panier pendingToBuy) →
      //     `updateOrders` qui applique la transition pendingToBuy → pending.
      //   - item SANS `id` → commande nouvelle (achat direct) → `createOrderService`.
      const orders = Array.isArray(items) ? items : [];
      const toUpdate = orders.filter(o => o && o.id);
      const toCreate = orders.filter(o => o && !o.id);

      if (orders.length === 0) {
        log.warn(`${logPrefix} ⚠️ Aucune commande dans le contexte → rien à faire (items vide)`);
      }

      // 1) Commandes existantes (panier) → transition pendingToBuy → pending.
      // updateOrders gère le tableau, le groupe par fastfood (multi-fastfood OK),
      // le stock check, le rank et la notif marchand.
      if (toUpdate.length > 0) {
        log.info(`${logPrefix} status=successful → Transition de ${toUpdate.length} commande(s) existante(s) pour ${userId}`);
        try {
          const res = await updateOrders(toUpdate, userId);
          if (res?.success) {
            log.info(`${logPrefix} ✓ ${toUpdate.length} commande(s) confirmée(s) (pendingToBuy → pending)`);
          } else {
            log.error(`${logPrefix} ❌ Échec transition commandes: ${res?.message}`);
          }
        } catch (e) {
          log.error(`${logPrefix} ❌ Exception transition commandes: ${e.message}`);
        }
      }

      // 2) Commandes nouvelles (achat direct) → création.
      // Échec partiel toléré : on crée tout ce qui peut l'être, on logue les échecs.
      for (const [i, order] of toCreate.entries()) {
        const label = `nouvelle commande ${i + 1}/${toCreate.length} (fastFoodId=${order?.fastFoodId})`;
        try {
          const created = await createOrderService({ ...order, userId });
          if (created?.error) {
            log.error(`${logPrefix} ❌ ${label} échouée: ${created.error}`);
          } else {
            log.info(`${logPrefix} ✓ ${label} confirmée (id=${created?.id || order.id})`);
          }
        } catch (e) {
          log.error(`${logPrefix} ❌ ${label} exception: ${e.message}`);
        }
      }

      // 3) Crédit du portefeuille marchand (par item, net de commissions).
      for (const item of orders) {
        try {
          await creditMerchantForItem({ item, clientUserId: userId });
        } catch (e) {
          log.error(`${logPrefix} ❌ Crédit marchand (fastFoodId=${item?.fastFoodId}) échoué: ${e.message}`);
        }
      }

      // 4) Créer la transaction client + notifier via socket newTransaction.
      try {
        const totalAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const firstName = orders[0]?.userData?.firstName || '';
        const menuName = orders[0]?.menu?.name || orders[0]?.menu?.titre || 'Commande';
        const name = orders.length > 1 ? `${menuName} (+${orders.length - 1})` : menuName;
        const clientTx = await repos.transactions.create({
          type: 'payment',
          userId,
          amount: totalAmount,
          name,
          payBy: network || orders[0]?.network || 'mobilemoney',
        });
        io.to(userId).emit('newTransaction', { message: 'nouvelle transaction', data: clientTx });
        log.info(`${logPrefix} ✓ Transaction client créée + socket newTransaction émis (amount=${totalAmount})`);
      } catch (e) {
        log.error(`${logPrefix} ❌ Transaction client échouée: ${e.message}`);
      }
    }

    // Marquer le pending_payment comme réglé (audit / purge ultérieure)
    try {
      await repos.pendingPayments.markSettled(ctx.paymentRef || end_user_ref, status);
    } catch (e) {
      log.warn(`${logPrefix} markSettled non critique: ${e.message}`);
    }

    log.info(`${logPrefix} ✓ Verdict traité avec succès`);
  } catch (error) {
    log.error(`${logPrefix} ❌ Erreur traitement verdict: ${error.message}`, error);
    // Ne pas relancer (controller/socket capturent déjà)
  }
};
