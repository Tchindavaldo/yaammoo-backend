// ============================================================================
// webhookPayout.service — Verdict d'un RETRAIT (payout MobileWallet)
// ============================================================================
// Appelé par mwVerdictService quand le transaction_id du verdict
// correspond à un withdrawal (mw_payout_id). Couvre webhook HTTP + socket.
//
// Règle métier : le DÉBIT (transaction 'withdrawal') n'est créé qu'au SUCCÈS.
//   - successful → withdrawal.status='completed' + transaction 'withdrawal'
//                  (débit réel = montant + frais interréseau, sur le solde SOURCE)
//   - failed/cancelled → withdrawal.status='failed' (aucun débit, solde intact)
//
// Idempotence : reserveSettlement (même table que les paiements) garantit qu'un
// seul canal (webhook OU socket) traite le verdict.
// ============================================================================

const { toBalanceKey } = require('../../utils/mobileNetwork');
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

const log = console;

/** Versement automatique d'une commande (kind 'order', orderPayout.service) : message WhatsApp au marchand. */
const notifyOrderPayout = (withdrawal, ok) => {
  if (withdrawal.kind !== 'order') return;
  // Chargé ici : le module WhatsApp n'a rien à faire dans le chargement des paiements.
  require('../whatsapp/merchantOrders.service')
    .notifyOrderPayout(withdrawal, ok)
    .catch(e => log.warn(`[Verdict Payout] message WhatsApp du versement ${withdrawal.id} non envoyé : ${e.message}`));
};

exports.webhookPayoutVerdict = async (withdrawal, data, source) => {
  const { transaction_id, status } = data;
  const logPrefix = `[Verdict Payout:${source}] tx=${transaction_id} withdrawalId=${withdrawal.id}`;

  // Idempotence (réutilise la table transaction_settlements)
  const reserved = await repos.transactions.reserveSettlement(transaction_id, source, status);
  if (!reserved) {
    log.warn(`${logPrefix} ✓ Verdict déjà traité → skip`);
    return;
  }

  // Verdict déjà final ? (re-livraison après completed/failed) → ne rien refaire
  if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
    log.warn(`${logPrefix} withdrawal déjà ${withdrawal.status} → skip`);
    return;
  }

  const userId = withdrawal.userId;
  const amt = Number(withdrawal.amount) || 0;
  // Frais interréseau (0 si même réseau) : débités EN PLUS du montant reçu.
  const fee = Number(withdrawal.fee) || 0;

  if (status === 'successful' && withdrawal.kind === 'platform') {
    // Retrait de la part plateforme (admin) : aucun portefeuille touché, une
    // transaction `platform_withdrawal` baisse la part disponible (platformShare.repo).
    await repos.transactions.create({
      type: 'platform_withdrawal',
      userId,
      amount: amt,
      name: 'Retrait part plateforme',
      payBy: withdrawal.network,
      aggregator: withdrawal.aggregator || null,
      network: withdrawal.sourceNetwork || null,
      mwTransactionId: transaction_id || null,
      withdrawalId: withdrawal.id,
      status: 'completed',
      phone: withdrawal.phone,
    });
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'completed' });
    log.info(`${logPrefix} ✓ Retrait plateforme confirmé → ${amt} sur ${withdrawal.sourceNetwork}`);
    await reliableEmit(getIO(), userId, 'wallet.platformWithdrawal', { withdrawalId: withdrawal.id, amount: amt, status: 'completed', network: withdrawal.sourceNetwork });
  } else if (status === 'successful') {
    // Découpage du débit : frais (kiosque + interréseau) pris d'abord sur la
    // réserve « frais » du solde source, le manque sur la part « commandes ».
    const kioskFee = Number(withdrawal.kioskFee) || 0;
    const before = await repos.transactions.getMerchantBalance(userId);
    const srcKey = toBalanceKey(withdrawal.sourceNetwork);
    const feesAvailable = Math.max(0, Number(before?.breakdown?.[srcKey]?.fees) || 0);
    const feesDebit = Math.min(feesAvailable, kioskFee + fee);

    // Débit réel : créer la transaction 'withdrawal' (impacte le solde dérivé).
    // Elle porte le SOLDE débité (`network` = source), pas le réseau de
    // réception : c'est ce solde-là qui baisse.
    await repos.transactions.create({
      type: 'withdrawal',
      userId,
      amount: amt + fee,
      name: withdrawal.kind === 'order' ? 'Versement commande' : 'Retrait portefeuille',
      payBy: withdrawal.network,
      aggregator: withdrawal.aggregator || null,
      network: withdrawal.sourceNetwork || null,
      mwTransactionId: transaction_id || null,
      withdrawalId: withdrawal.id,
      status: 'completed',
      phone: withdrawal.phone,
      receivedAmount: amt,
      fee,
      receiverNetwork: withdrawal.network,
      // extra_data : espèces nettes, frais kiosque, part prise sur la réserve.
      cashAmount: amt - kioskFee,
      kioskFee,
      feesDebit,
      // Versement automatique : commande versée (migration 086).
      relatedOrderId: withdrawal.orderId || undefined,
    });
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'completed' });
    log.info(`${logPrefix} ✓ Retrait confirmé → débit ${amt + fee} (dont frais ${fee}) sur ${withdrawal.sourceNetwork}`);
    notifyOrderPayout(withdrawal, true);

    const { balance, mtn, orange, breakdown } = await repos.transactions.getMerchantBalance(userId);
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt - kioskFee,
      kioskFee,
      sentAmount: amt,
      fee,
      status: 'completed',
      network: withdrawal.network,
      sourceNetwork: withdrawal.sourceNetwork,
      newBalance: balance,
      newBalances: { mtn, orange },
      newBreakdown: breakdown,
      createdAt: new Date().toISOString(),
    });
  } else {
    // failed / cancelled → pas de débit, solde intact
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'failed', failureReason: data.message || status });
    log.info(`${logPrefix} ✗ Retrait ${status} → aucun débit (solde intact)`);
    if (withdrawal.kind === 'order') {
      await repos.appErrors.record({ scope: 'order_payout', code: 'payout_failed', message: `Versement automatique ÉCHOUÉ (${amt} F vers ${withdrawal.phone}) : ${data.message || status}. Relancé au prochain scan, sinon à faire à la main.`, orderId: withdrawal.orderId, userId, fastFoodId: withdrawal.fastFoodId, context: { withdrawalId: withdrawal.id } });
    }
    notifyOrderPayout(withdrawal, false);

    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt - (Number(withdrawal.kioskFee) || 0),
      status: 'failed',
      reason: status,
      message: data.message || null, // message exact MobileWallet (ex. numéro invalide)
      network: withdrawal.network,
      sourceNetwork: withdrawal.sourceNetwork,
    });
  }
};
