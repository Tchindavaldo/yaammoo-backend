// ============================================================================
// withdraw.service — Demande de retrait du portefeuille marchand / livreur
// ============================================================================
// Le solde est calculé depuis les transactions, PAR RÉSEAU (MTN / Orange). Le
// débit (transaction 'withdrawal') n'est créé QU'AU SUCCÈS du payout (cf.
// webhookPayout.service) — pas à la demande. Une demande de retrait :
//   1. valide les champs (montant, numéro, réseau de réception, solde source),
//   2. calcule les frais : 0 même réseau, interréseau via MobileWallet,
//   3. vérifie le solde SOURCE (>= montant + frais) — aucun repli sur l'autre,
//   4. bloque s'il existe déjà un retrait 'pending' pour cet utilisateur,
//   5. applique un cooldown (WITHDRAWAL_COOLDOWN_HOURS) depuis le dernier retrait,
//   6. insère une ligne `withdrawals` (status='pending', source, frais),
//   7. appelle MobileWallet /payout (agrégateur + source_network), stocke mw_payout_id,
//   8. émet un socket fiable `wallet.withdrawal` (status='pending').
// Le verdict final (completed/failed) arrive via webhook/socket.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateWithdrawal } = require('../../utils/validator/validateWithdrawal');
const { reliableEmit } = require('../../utils/reliableEmit');
const { getPaymentAggregator } = require('../settings/settings.service');
const mobilewallet = require('../transaction/mobilewalletService');
const { quoteWithdrawal } = require('./withdrawQuote.service');

// 0 = désactivé (dev). Si non défini → 24h par défaut (prod).
const COOLDOWN_HOURS = process.env.WITHDRAWAL_COOLDOWN_HOURS !== undefined ? Number(process.env.WITHDRAWAL_COOLDOWN_HOURS) : 24;

const NETWORK_LABEL = { MTN: 'MTN', ORANGEMONEY: 'Orange' };

/** Vue renvoyée au front : aucun nom d'agrégateur ne sort. */
const publicWithdrawal = w => (w ? { ...w, aggregator: undefined } : w);

/**
 * @param {object} params { userId, amount, phone, network, sourceNetwork, receiverName?, narration? }
 * @returns {{ success:boolean, httpStatus:number, code?:string, message?:string, data?:object }}
 */
exports.requestWithdrawal = async ({ userId, amount, phone, network, sourceNetwork, receiverName, narration }) => {
  if (!userId) {
    return { success: false, httpStatus: 401, code: 'unauthenticated', message: 'Utilisateur non authentifié' };
  }

  const errors = validateWithdrawal({ amount, phone, network, sourceNetwork });
  if (errors.length > 0) {
    return {
      success: false,
      httpStatus: 400,
      code: 'invalid_input',
      message: errors.map(e => `${e.field}: ${e.message}`).join(', '),
    };
  }

  const amt = Number(amount);

  // 1. Frais + solde source (source de vérité : les transactions)
  // ⚠️ TEMPORAIRE : contrôle de solde désactivable via DISABLE_WITHDRAWAL_BALANCE_CHECK=true.
  //    Réactiver (retirer le flag) une fois les tests terminés.
  const SKIP_BALANCE_CHECK = process.env.DISABLE_WITHDRAWAL_BALANCE_CHECK === 'true';
  const quote = await quoteWithdrawal({ userId, amount: amt, network, sourceNetwork });
  if (!quote.success) return quote;
  const { fee, totalDebited, sourceBalance } = quote.data;

  if (!SKIP_BALANCE_CHECK && totalDebited > sourceBalance) {
    const label = NETWORK_LABEL[sourceNetwork] || sourceNetwork;
    const detail = fee > 0 ? ` (${amt} FCFA + ${fee} FCFA de frais)` : '';
    return {
      success: false,
      httpStatus: 400,
      code: 'insufficient_balance',
      message: `Solde ${label} insuffisant : disponible ${sourceBalance} FCFA, nécessaire ${totalDebited} FCFA${detail}.`,
      data: quote.data,
    };
  }

  // 2. Bloquer si un retrait est déjà en cours
  const pending = await repos.withdrawals.getPendingByUser(userId);
  if (pending) {
    return {
      success: false,
      httpStatus: 409,
      code: 'withdrawal_in_progress',
      message: 'Un retrait est déjà en cours. Attendez sa confirmation avant d’en relancer un.',
    };
  }

  // 3. Cooldown depuis le dernier retrait (COOLDOWN_HOURS=0 → désactivé, ex. en dev)
  const last = COOLDOWN_HOURS > 0 ? await repos.withdrawals.getLatestByUser(userId) : null;
  if (last?.createdAt) {
    const elapsedMs = Date.now() - new Date(last.createdAt).getTime();
    const cooldownMs = COOLDOWN_HOURS * 3600 * 1000;
    if (elapsedMs < cooldownMs) {
      const remainingH = Math.ceil((cooldownMs - elapsedMs) / 3600000);
      return {
        success: false,
        httpStatus: 429,
        code: 'cooldown',
        message: `Vous devez attendre ${COOLDOWN_HOURS}h entre deux retraits. Réessayez dans ~${remainingH}h.`,
      };
    }
  }

  // receiver_name : body → nom marchand (users) → nom fastfood
  const fastfood = await repos.fastfoods.getByUserId(userId).catch(() => null);
  let finalReceiver = receiverName;
  if (!finalReceiver) {
    const user = await repos.users.getUserById(userId).catch(() => null);
    const fullName = [user?.infos?.prenom, user?.infos?.nom].filter(Boolean).join(' ').trim();
    finalReceiver = fullName || fastfood?.name || 'Marchand yaammoo';
  }

  const aggregator = await getPaymentAggregator();

  // 4. Tracer la demande (pending) — AUCUN débit à ce stade
  const withdrawal = await repos.withdrawals.create({
    userId,
    fastFoodId: fastfood?.id || null,
    amount: amt,
    phone,
    network,
    sourceNetwork,
    fee,
    aggregator,
    status: 'pending',
  });

  // 5. Appel MobileWallet /payout
  const mw = await mobilewallet.payout({
    amount: amt,
    network,
    sourceNetwork,
    phone,
    receiverName: finalReceiver,
    narration,
    withdrawalId: withdrawal.id,
    aggregator,
  });

  if (!mw || mw.status === 'error') {
    // Échec d'initiation → marquer failed (aucun débit n'a eu lieu, solde intact)
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'failed', failureReason: mw?.message || 'payout init failed' });
    return {
      success: false,
      httpStatus: mw?.httpStatus || 502,
      code: mw?.code || 'payout_failed',
      message: mw?.message || 'Échec de l’initiation du retrait',
      retry_after_s: mw?.retry_after_s,
    };
  }

  // Frais réellement retenus par MobileWallet : ils font foi pour le débit.
  const finalFee = network === sourceNetwork ? 0 : Number.isFinite(mw.fee) ? mw.fee : fee;

  // Stocker l'id MobileWallet pour router le verdict
  await repos.withdrawals.updateStatus(withdrawal.id, { mwPayoutId: mw.transaction_id, fee: finalFee });

  // 6. Notifier l'utilisateur (statut pending). Émission fiable.
  try {
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt,
      fee: finalFee,
      status: 'pending',
      network,
      sourceNetwork,
      mwTransactionId: mw.transaction_id,
      createdAt: withdrawal.createdAt,
    });
  } catch (e) {
    console.warn('[withdraw] émission socket non critique:', e.message);
  }

  return {
    success: true,
    httpStatus: 200,
    message: mw.message || 'Retrait en cours de traitement',
    data: { withdrawal: publicWithdrawal({ ...withdrawal, fee: finalFee, mwPayoutId: mw.transaction_id }), status: 'pending' },
  };
};
