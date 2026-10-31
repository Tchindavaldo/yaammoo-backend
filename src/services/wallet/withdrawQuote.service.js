// ============================================================================
// withdrawQuote.service — Frais d'un retrait AVANT confirmation
// ============================================================================
// Le portefeuille a deux soldes (MTN / Orange). L'utilisateur choisit le solde
// débité (`sourceNetwork`) ET le numéro de réception (`network`, détecté à la
// saisie). Aucun repli automatique sur l'autre solde.
//
//   même réseau  → 0 F : les frais de virement ont été prépayés au dépôt
//                  (réserve de retrait pawaPay, cf. pricing/paymentFees.js) ;
//   interréseau  → ⌈taux du réseau de destination × montant⌉, débité EN PLUS
//                  du montant sur le solde source.
//
// Le frais interréseau vient de MobileWallet (`GET /payout/quote`), qui fait
// foi. Le taux en base (`pawapay_payout_fee_<réseau>_percent`) ne sert qu'à
// estimer `maxAmount` : le plus gros montant qu'on peut recevoir, frais
// compris, depuis ce solde.
// ============================================================================

const repos = require('../../repositories');
const mobilewallet = require('../transaction/mobilewalletService');
const { getPricingSettings } = require('../settings/settings.service');
const { getPaymentAggregator } = require('../settings/settings.service');
const { toBalanceKey } = require('../../utils/mobileNetwork');

/** Taux interréseau (%) vers un réseau, depuis les réglages pawaPay. */
async function crossNetworkRate(network) {
  const pricing = await getPricingSettings();
  const key = toBalanceKey(network);
  return Number(pricing?.paymentFees?.pawapay?.payoutReserve?.[key]) || 0;
}

/**
 * Plus gros montant reçu X tel que X + ⌈taux × X⌉ ≤ solde.
 * Estimation : le retrait lui-même redemande le devis à MobileWallet.
 */
function maxReceivable(balance, ratePercent) {
  const b = Math.floor(Number(balance) || 0);
  if (b <= 0) return 0;
  if (ratePercent <= 0) return b;
  let x = Math.floor(b / (1 + ratePercent / 100));
  while (x > 0 && x + Math.ceil((x * ratePercent) / 100) > b) x -= 1;
  return x;
}

/**
 * Devis d'un retrait pour un utilisateur.
 *
 * @param {Object} params { userId, amount, network, sourceNetwork }
 * @returns {Promise<{ success:true, data:{ amount, fee, totalDebited, sourceBalance, sufficient, maxAmount, sameNetwork } }
 *   | { success:false, httpStatus, code, message }>}
 */
exports.quoteWithdrawal = async ({ userId, amount, network, sourceNetwork }) => {
  const amt = Number(amount);
  const sameNetwork = network === sourceNetwork;

  const balances = await repos.transactions.getMerchantBalance(userId);
  const sourceBalance = Number(balances[toBalanceKey(sourceNetwork)]) || 0;

  let fee = 0;
  if (!sameNetwork) {
    const quote = await mobilewallet.payoutQuote({ amount: amt, network, sourceNetwork, aggregator: await getPaymentAggregator() });
    if (!quote.success) return quote;
    fee = quote.fee;
  }

  const rate = sameNetwork ? 0 : await crossNetworkRate(network);
  const totalDebited = amt + fee;

  return {
    success: true,
    data: {
      amount: amt,
      fee,
      totalDebited,
      sourceBalance,
      sufficient: totalDebited <= sourceBalance,
      maxAmount: maxReceivable(sourceBalance, rate),
      sameNetwork,
    },
  };
};
