// ============================================================================
// withdraw.service — Demande de retrait du portefeuille marchand
// ============================================================================
// Le solde est calculé depuis les transactions. Le débit (transaction
// 'withdrawal') n'est créé QU'AU SUCCÈS du payout (cf. mwVerdictService
// branche payout) — pas à la demande. Une demande de retrait :
//   1. valide les champs + le solde (>= montant),
//   2. bloque s'il existe déjà un retrait 'pending' pour ce marchand,
//   3. applique un cooldown (WITHDRAWAL_COOLDOWN_HOURS) depuis le dernier retrait,
//   4. insère une ligne `withdrawals` (status='pending'),
//   5. appelle MobileWallet /payout, stocke mw_payout_id,
//   6. émet un socket fiable `wallet.withdrawal` (status='pending').
// Le verdict final (completed/failed) arrive via webhook/socket.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateWithdrawal } = require('../../utils/validator/validateWithdrawal');
const { reliableEmit } = require('../../utils/reliableEmit');
const mobilewallet = require('../transaction/mobilewalletService');

// 0 = désactivé (dev). Si non défini → 24h par défaut (prod).
const COOLDOWN_HOURS = process.env.WITHDRAWAL_COOLDOWN_HOURS !== undefined ? Number(process.env.WITHDRAWAL_COOLDOWN_HOURS) : 24;

/**
 * @param {object} params { userId, amount, phone, network, receiverName?, narration? }
 * @returns {{ success:boolean, httpStatus:number, code?:string, message?:string, data?:object }}
 */
exports.requestWithdrawal = async ({ userId, amount, phone, network, receiverName, narration }) => {
  if (!userId) {
    return { success: false, httpStatus: 401, code: 'unauthenticated', message: 'Utilisateur non authentifié' };
  }

  const errors = validateWithdrawal({ amount, phone, network });
  if (errors.length > 0) {
    return {
      success: false,
      httpStatus: 400,
      code: 'invalid_input',
      message: errors.map(e => `${e.field}: ${e.message}`).join(', '),
    };
  }

  const amt = Number(amount);

  // 1. Solde dérivé (source de vérité)
  // ⚠️ TEMPORAIRE : contrôle de solde désactivable via DISABLE_WITHDRAWAL_BALANCE_CHECK=true.
  //    Réactiver (retirer le flag) une fois les tests terminés.
  const SKIP_BALANCE_CHECK = process.env.DISABLE_WITHDRAWAL_BALANCE_CHECK === 'true';
  const { balance } = await repos.transactions.getMerchantBalance(userId);
  if (!SKIP_BALANCE_CHECK && amt > balance) {
    return {
      success: false,
      httpStatus: 400,
      code: 'insufficient_balance',
      message: `Solde insuffisant : disponible ${balance} FCFA, demandé ${amt} FCFA`,
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

  // 4. Tracer la demande (pending) — AUCUN débit à ce stade
  const withdrawal = await repos.withdrawals.create({
    userId,
    fastFoodId: fastfood?.id || null,
    amount: amt,
    phone,
    network,
    status: 'pending',
  });

  // 5. Appel MobileWallet /payout
  const mw = await mobilewallet.payout({
    amount: amt,
    network,
    phone,
    receiverName: finalReceiver,
    narration,
    withdrawalId: withdrawal.id,
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

  // Stocker l'id MobileWallet pour router le verdict
  await repos.withdrawals.updateStatus(withdrawal.id, { mwPayoutId: mw.transaction_id });

  // 6. Notifier le marchand (statut pending). Émission fiable.
  try {
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: amt,
      status: 'pending',
      network,
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
    data: { withdrawal: { ...withdrawal, mwPayoutId: mw.transaction_id }, status: 'pending' },
  };
};
