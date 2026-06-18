// ============================================================================
// withdraw.service — Demande de retrait du portefeuille marchand
// ============================================================================
// Le solde est calculé depuis les transactions. Un retrait :
//   1. recalcule le solde (source de vérité),
//   2. valide montant > 0 et montant <= solde,
//   3. insère une ligne `withdrawals` (status='pending'),
//   4. crée une transaction `type='withdrawal'` (débite le solde dérivé),
//   5. [STUB] appellera l'endpoint MobileWallet payout (fourni plus tard),
//   6. émet un socket `wallet.withdrawal` vers le marchand.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { validateWithdrawal } = require('../../utils/validator/validateWithdrawal');

/**
 * @param {object} params { userId, amount, phone, network }
 * @returns {{ success:boolean, httpStatus:number, code?:string, message?:string, data?:object }}
 */
exports.requestWithdrawal = async ({ userId, amount, phone, network }) => {
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
  const { balance } = await repos.transactions.getMerchantBalance(userId);
  if (amt > balance) {
    return {
      success: false,
      httpStatus: 400,
      code: 'insufficient_balance',
      message: `Solde insuffisant : disponible ${balance} FCFA, demandé ${amt} FCFA`,
    };
  }

  // Boutique du marchand (pour traçabilité)
  const fastfood = await repos.fastfoods.getByUserId(userId).catch(() => null);

  // 2. Tracer la demande de retrait (pending)
  const withdrawal = await repos.withdrawals.create({
    userId,
    fastFoodId: fastfood?.id || null,
    amount: amt,
    phone,
    network,
    status: 'pending',
  });

  // 3. Débiter le portefeuille (transaction de type 'withdrawal')
  await repos.transactions.create({
    type: 'withdrawal',
    userId,
    amount: amt,
    name: 'Retrait portefeuille',
    payBy: network,
    withdrawalId: withdrawal.id,
    status: 'pending',
    phone,
    network,
  });

  // 4. STUB MobileWallet payout.
  // TODO: brancher l'endpoint MobileWallet de retrait ici. Au retour :
  //   - succès → repos.withdrawals.updateStatus(withdrawal.id, { status:'completed', mwPayoutId })
  //   - échec  → repos.withdrawals.updateStatus(withdrawal.id, { status:'failed', failureReason })
  //              + rembourser le solde (transaction merchant_credit compensatoire).
  // Pour l'instant, le retrait reste 'pending'.

  // 5. Notifier le marchand
  try {
    getIO().to(userId).emit('wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      amount: amt,
      status: withdrawal.status,
    });
  } catch (e) {
    console.warn('[withdraw] émission socket non critique:', e.message);
  }

  return {
    success: true,
    httpStatus: 200,
    message: 'Demande de retrait enregistrée',
    data: { withdrawal, newBalance: balance - amt },
  };
};
