// ============================================================================
// orderPayout.service — Versement automatique d'une commande livrée (boutique WhatsApp)
// ============================================================================
// Appelé par confirmDelivery.service à la validation par QR (scan dans l'app ou
// message « LIVRÉ » sur WhatsApp), pour les boutiques `whatsappOrders` seulement.
// Même mécanique qu'un retrait (withdraw.service, verdict webhookPayout.service) :
//   - montant = crédit du marchand pour CETTE commande (merchant_credit, déjà net :
//     plats réels + frais de retrait + course s'il livre, cf. money-rules.md) ;
//   - solde source = réseau du paiement ; numéro = numéro de versement de la boutique
//     (payout_numbers), de préférence sur le même réseau (0 F) ;
//   - interréseau : frais pris sur la part de la commande (envoyé + frais = crédit) ;
//   - pas de blocage doublon ni de délai : un versement par commande livrée
//     (withdrawals.order_id, migration 086). Un versement échoué se relance au scan suivant.
// Débit réel au verdict `successful` seulement. Tout échec est tracé dans app_errors.
// Doc : architecture/wallet.md (« Versement automatique d'une commande »).
// ============================================================================
const repos = require('../../repositories');
const mobilewallet = require('../transaction/mobilewalletService');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { countsInWallet } = require('../../utils/paymentAggregator');
const { toBalanceKey, toCanonicalNetwork } = require('../../utils/mobileNetwork');
const { crossNetworkRate } = require('./withdrawQuote.service');

const skipped = (code, message) => ({ status: 'skipped', code, message });

/** Numéro de versement de la boutique : même réseau que le solde source d'abord. */
async function pickPayoutNumber(userId, sourceNetwork, aggregator) {
  let other = null;
  for (const n of await repos.payoutNumbers.listByUser(userId)) {
    const p = await mobilewallet.predictOperator({ phone: n.phoneNumber, aggregator });
    if (!p.success || !p.network) continue;
    if (p.network === sourceNetwork) return { phone: n.phoneNumber, network: p.network };
    other = other || { phone: n.phoneNumber, network: p.network };
  }
  return other;
}

/**
 * Montant envoyé et frais. Même réseau : tout le crédit, 0 F. Interréseau : plus
 * gros envoi tel que envoi + frais (devis MobileWallet, qui fait foi) <= crédit.
 */
async function amountsOf(credit, network, sourceNetwork, aggregator) {
  const total = credit.amount;
  if (network === sourceNetwork) return { sentAmount: total, fee: 0 };
  const rate = await crossNetworkRate(network);
  const cost = s => s + Math.ceil((s * rate) / 100);
  let sent = Math.floor(total / (1 + rate / 100));
  while (sent > 0 && cost(sent) > total) sent -= 1;
  while (cost(sent + 1) <= total) sent += 1;
  for (let i = 0; i < 3 && sent > 0; i += 1) {
    const q = await mobilewallet.payoutQuote({ amount: sent, network, sourceNetwork, aggregator });
    if (!q.success) return { error: q.message || 'devis interréseau indisponible' };
    if (sent + q.fee <= total) return { sentAmount: sent, fee: q.fee };
    sent = total - q.fee;
  }
  return { error: `frais interréseau supérieurs à la part de la commande (${total} F)` };
}

/**
 * @param {object} order commande livrée
 * @param {object} fastFood boutique (whatsappOrders)
 * @returns {Promise<{status:'pending'|'skipped'|'failed', code?, message?, sentAmount?, fee?, phone?, network?}>}
 */
exports.payOrderToMerchant = async (order, fastFood) => {
  const userId = fastFood?.userId;
  const ctx = { orderId: order.id, userId: userId || null, fastFoodId: fastFood?.id || order.fastFoodId };
  const failed = async (code, message, context = {}) => {
    console.error(`❌ [VERSEMENT] Commande ${order.id} : ${message}`);
    await repos.appErrors.record({ scope: 'order_payout', code, message: `Versement automatique NON fait : ${message} À faire à la main.`, ...ctx, context });
    return { status: 'failed', code, message };
  };

  if (!userId) return failed('owner_missing', 'propriétaire de la boutique introuvable.');
  if (await repos.withdrawals.getActiveByOrder(order.id)) return skipped('already_paid', 'Versement déjà fait pour cette commande');

  const credit = await repos.transactions.findMerchantCreditByOrder(order.id);
  const sourceNetwork = toCanonicalNetwork(credit?.network);
  // Sans paiement réel (build de test, Apple Review) : le crédit est hors portefeuille.
  if (!credit || !countsInWallet(credit.aggregator) || !sourceNetwork || credit.amount <= 0) {
    return skipped('no_wallet_credit', 'Pas de crédit réel pour cette commande : rien à verser');
  }
  const aggregator = credit.aggregator;

  const target = await pickPayoutNumber(userId, sourceNetwork, aggregator);
  if (!target) return failed('payout_number_missing', 'aucun numéro de versement Orange / MTN enregistré pour la boutique.', { credit });

  const amounts = await amountsOf(credit, target.network, sourceNetwork, aggregator);
  if (amounts.error) return failed('payout_quote_failed', `${amounts.error}.`, { credit, target });
  const { sentAmount, fee } = amounts;

  const balances = await repos.transactions.getMerchantBalance(userId);
  const sourceBalance = Number(balances?.[toBalanceKey(sourceNetwork)]) || 0;
  if (sentAmount + fee > sourceBalance) {
    return failed('insufficient_balance', `solde ${sourceNetwork} ${sourceBalance} F < ${sentAmount + fee} F à débiter.`, { credit, target, sentAmount, fee });
  }

  let withdrawal;
  try {
    withdrawal = await repos.withdrawals.create({
      userId,
      fastFoodId: ctx.fastFoodId,
      orderId: order.id,
      kind: 'order',
      amount: sentAmount,
      kioskFee: Math.min(credit.kioskFee, sentAmount),
      phone: target.phone,
      network: target.network,
      sourceNetwork,
      fee,
      aggregator,
      status: 'pending',
    });
  } catch (e) {
    // Index unique (migration 086) : un autre scan a lancé le versement en même temps.
    if (e?.code === '23505') return skipped('already_paid', 'Versement déjà en cours pour cette commande');
    throw e;
  }

  const mw = await mobilewallet.payout({
    amount: sentAmount,
    network: target.network,
    sourceNetwork,
    phone: target.phone,
    receiverName: fastFood.name || 'Marchand yaammoo',
    narration: `Commande ${order.id.slice(-6).toUpperCase()}`,
    withdrawalId: withdrawal.id,
    aggregator,
  });
  if (!mw || mw.status === 'error') {
    await repos.withdrawals.updateStatus(withdrawal.id, { status: 'failed', failureReason: mw?.message || 'payout init failed' });
    return failed('payout_init_failed', `MobileWallet a refusé l'envoi (${mw?.message || 'payout init failed'}).`, { withdrawalId: withdrawal.id, sentAmount, fee });
  }

  const finalFee = target.network === sourceNetwork ? 0 : Number.isFinite(mw.fee) ? mw.fee : fee;
  await repos.withdrawals.updateStatus(withdrawal.id, { mwPayoutId: mw.transaction_id, fee: finalFee });
  console.log(`✅ [VERSEMENT] Commande ${order.id} : ${sentAmount} F vers ${target.phone} (${sourceNetwork}→${target.network}, frais ${finalFee})`);

  try {
    await reliableEmit(getIO(), userId, 'wallet.withdrawal', {
      withdrawalId: withdrawal.id,
      type: 'withdrawal',
      direction: 'payout',
      amount: sentAmount - withdrawal.kioskFee,
      kioskFee: withdrawal.kioskFee,
      sentAmount,
      fee: finalFee,
      status: 'pending',
      network: target.network,
      sourceNetwork,
      relatedOrderId: order.id,
      mwTransactionId: mw.transaction_id,
      createdAt: withdrawal.createdAt,
    });
  } catch (e) {
    console.warn('[VERSEMENT] émission socket non critique:', e.message);
  }

  return { status: 'pending', sentAmount, fee: finalFee, phone: target.phone, network: target.network };
};
