// ============================================================================
// platformWithdraw.service — Retrait de la part plateforme (admin)
// ============================================================================
// L'admin retire de la part de Yaammoo (platformShare.repo) vers un numéro
// Mobile Money, SUR LE MÊME RÉSEAU que la part débitée : la réserve de retrait
// pawaPay prise au dépôt paie le payout, aucun frais interréseau.
//
//   1. plafond : `available` du réseau (gagné − déjà retiré − en cours) ;
//   2. verrou global PLATFORM_LOCK (partagé avec les versements aux boutiques) ;
//   3. demande `withdrawals` kind='platform' (status pending), payout MobileWallet ;
//   4. au succès (webhookPayout.service) : transaction `platform_withdrawal`.
// Aucun portefeuille marchand n'est touché.
// ============================================================================
const repos = require('../../repositories');
const mobilewallet = require('../transaction/mobilewalletService');
const { getPaymentAggregator } = require('../settings/settings.service');
const { toBalanceKey } = require('../../utils/mobileNetwork');
const { PLATFORM_LOCK } = require('./platformTransfer.service');

const fail = (httpStatus, code, message, data) => ({ success: false, httpStatus, code, message, ...(data ? { data } : {}) });

exports.requestPlatformWithdrawal = async ({ adminUid, amount, phone, network, reason }) => {
  const amt = Number(amount);
  if (!(await repos.platformTransfers.acquireLocks([PLATFORM_LOCK], adminUid))) {
    return fail(409, 'platform_operation_in_progress', 'Un retrait ou un versement est déjà en cours sur la part plateforme');
  }
  try {
    const share = await repos.platformShare.getPlatformShare();
    const key = toBalanceKey(network);
    const available = share.byNetwork[key]?.available ?? 0;
    if (amt > available) {
      return fail(400, 'insufficient_platform_share', `Part plateforme ${network} insuffisante : disponible ${Math.max(0, available)} FCFA, demandé ${amt} FCFA.`, { available: Math.max(0, available) });
    }

    const aggregator = await getPaymentAggregator();
    const withdrawal = await repos.withdrawals.create({
      userId: adminUid,
      fastFoodId: null,
      amount: amt,
      kioskFee: 0,
      phone,
      network,
      sourceNetwork: network,
      fee: 0,
      aggregator,
      kind: 'platform',
      status: 'pending',
    });
    console.info(`[PlatformWithdraw] admin=${adminUid} → ${amt} ${network} vers ${phone} (disponible ${available})${reason ? ` motif: ${reason}` : ''}`);

    const mw = await mobilewallet.payout({
      amount: amt,
      network,
      sourceNetwork: network,
      phone,
      receiverName: 'Yaammoo',
      narration: reason || 'Retrait part plateforme',
      withdrawalId: withdrawal.id,
      aggregator,
    });
    if (!mw || mw.status === 'error') {
      await repos.withdrawals.updateStatus(withdrawal.id, { status: 'failed', failureReason: mw?.message || 'payout init failed' });
      return fail(mw?.httpStatus || 502, mw?.code || 'payout_failed', mw?.message || 'Échec de l’initiation du retrait');
    }
    await repos.withdrawals.updateStatus(withdrawal.id, { mwPayoutId: mw.transaction_id });
    return { success: true, httpStatus: 200, data: { withdrawalId: withdrawal.id, amount: amt, network, status: 'pending', availableBefore: available } };
  } finally {
    await repos.platformTransfers.releaseLocks([PLATFORM_LOCK]);
  }
};
