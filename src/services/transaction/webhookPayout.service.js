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
  // Frais interréseau (0 si même réseau) : débités EN PLUS du montant reçu.
  const fee = Number(withdrawal.fee) || 0;

  if (status === 'successful') {
    // Débit réel : créer la transaction 'withdrawal' (impacte le solde dérivé).
    // Elle porte le SOLDE débité (`network` = source), pas le réseau de
    // réception : c'est ce solde-là qui baisse.
    await repos.transactions.create({
      type: 'withdrawal',
      userId,
      amount: amt + fee,
      name: 'Retrait portefeuille',
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
    });
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'completed' });
    log.info(`${logPrefix} ✓ Retrait confirmé → débit ${amt + fee} (dont frais ${fee}) sur ${withdrawal.sourceNetwork}`);

    const { balance, mtn, orange } = await repos.transactions.getMerchantBalance(userId);
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt,
      fee,
      status: 'completed',
      network: withdrawal.network,
      sourceNetwork: withdrawal.sourceNetwork,
      newBalance: balance,
      newBalances: { mtn, orange },
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
      sourceNetwork: withdrawal.sourceNetwork,
    });
  }
};
