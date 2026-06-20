// ============================================================================
// webhookPayout.service — Verdict d'un RETRAIT (payout MobileWallet)
// ============================================================================
// Appelé par webhookMobilewalletService quand le transaction_id du verdict
// correspond à un withdrawal (mw_payout_id). Couvre webhook HTTP + socket.
//
// Règle métier : le DÉBIT (transaction 'withdrawal') n'est créé qu'au SUCCÈS.
//   - successful → withdrawal.status='completed' + transaction 'withdrawal' (débit réel)
//   - failed/cancelled → withdrawal.status='failed' (aucun débit, solde intact)
//
// Idempotence : reserveSettlement (même table que les paiements) garantit qu'un
// seul canal (webhook OU socket) traite le verdict.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

const log = console;

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

  if (status === 'successful') {
    // Débit réel : créer la transaction 'withdrawal' (impacte le solde dérivé)
    await repos.transactions.create({
      type: 'withdrawal',
      userId,
      amount: amt,
      name: 'Retrait portefeuille',
      payBy: withdrawal.network,
      withdrawalId: withdrawal.id,
      status: 'completed',
      phone: withdrawal.phone,
      network: withdrawal.network,
    });
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'completed' });
    log.info(`${logPrefix} ✓ Retrait confirmé → débit ${amt} appliqué`);

    const { balance } = await repos.transactions.getMerchantBalance(userId);
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt,
      status: 'completed',
      network: withdrawal.network,
      newBalance: balance,
      createdAt: new Date().toISOString(),
    });
  } else {
    // failed / cancelled → pas de débit, solde intact
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'failed', failureReason: status });
    log.info(`${logPrefix} ✗ Retrait ${status} → aucun débit (solde intact)`);

    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt,
      status: 'failed',
      reason: status,
      network: withdrawal.network,
    });
  }
};
