// ============================================================================
// withdrawQuote.service — Frais d'un retrait AVANT confirmation
// ============================================================================
// Le portefeuille a deux soldes (MTN / Orange). L'utilisateur choisit le solde
// débité (`sourceNetwork`) ET le numéro de réception (`network`, détecté à la
// saisie). Aucun repli automatique sur l'autre solde.
//
//   `amount` = espèces voulues ; envoyé = amount + frais kiosque (1,2 % + 4
//   du réseau de réception), pour que le marchand touche `amount` chez l'agent.
//
//   même réseau  → 0 F : les frais de virement ont été prépayés au dépôt
//                  (réserve de retrait pawaPay, cf. pricing/paymentFees.js) ;
//   interréseau  → ⌈taux du réseau de destination × montant ENVOYÉ⌉, débité EN PLUS
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
const { withdrawalFee } = require('../pricing/withdrawalFees');

/** Taux interréseau (%) vers un réseau, depuis les réglages pawaPay. */
async function crossNetworkRate(network) {
  const pricing = await getPricingSettings();
  const key = toBalanceKey(network);
  return Number(pricing?.paymentFees?.pawapay?.payoutReserve?.[key]) || 0;
}

/**
 * Taux interréseau (%) par réseau de RÉCEPTION, pour l'affichage avant saisie
 * du montant (« +1 % interréseau » sur la carte du numéro). Indicatif : le
 * frais réel reste celui du devis MobileWallet.
 */
exports.crossNetworkRates = async () => ({
  mtn: await crossNetworkRate('MTN'),
  orange: await crossNetworkRate('ORANGEMONEY'),
});

/** Frais de retrait kiosque (espèces chez l'agent) sur le réseau de RÉCEPTION. */
async function kioskFeeOf(cash, network) {
  const pricing = await getPricingSettings();
  return withdrawalFee(cash, pricing?.withdrawalFees, network);
}

/**
 * Plus gros montant en ESPÈCES X tel que
 * X + kiosque(X) + ⌈taux × (X + kiosque(X))⌉ ≤ solde.
 * Estimation : le retrait lui-même redemande le devis à MobileWallet.
 */
async function maxCash(balance, ratePercent, network) {
  const b = Math.floor(Number(balance) || 0);
  if (b <= 0) return 0;
  const pricing = await getPricingSettings();
  const cost = x => {
    const sent = x + withdrawalFee(x, pricing?.withdrawalFees, network);
    return sent + (ratePercent > 0 ? Math.ceil((sent * ratePercent) / 100) : 0);
  };
  let x = Math.floor(b / (1 + (1.2 + ratePercent) / 100));
  while (x < b && cost(x + 1) <= b) x += 1;
  while (x > 0 && cost(x) > b) x -= 1;
  return x;
}

/**
 * Devis d'un retrait pour un utilisateur.
 *
 * `amount` = espèces voulues (ce que le marchand touche chez l'agent). On
 * envoie au téléphone `sentAmount` = amount + frais kiosque ; en interréseau,
 * `fee` porte sur ce montant envoyé (c'est lui qui transite).
 *
 * @param {Object} params { userId, amount, network, sourceNetwork }
 * @returns {Promise<{ success:true, data:{ amount, kioskFee, sentAmount, fee, totalDebited, sourceBalance, sufficient, maxAmount, sameNetwork } }
 *   | { success:false, httpStatus, code, message }>}
 */
exports.quoteWithdrawal = async ({ userId, amount, network, sourceNetwork }) => {
  const amt = Number(amount);
  const sameNetwork = network === sourceNetwork;

  const balances = await repos.transactions.getMerchantBalance(userId);
  const sourceBalance = Number(balances[toBalanceKey(sourceNetwork)]) || 0;

  const kioskFee = await kioskFeeOf(amt, network);
  const sentAmount = amt + kioskFee;

  let fee = 0;
  if (!sameNetwork) {
    const quote = await mobilewallet.payoutQuote({ amount: sentAmount, network, sourceNetwork, aggregator: await getPaymentAggregator() });
    if (!quote.success) return quote;
    fee = quote.fee;
  }

  const rate = sameNetwork ? 0 : await crossNetworkRate(network);
  const totalDebited = sentAmount + fee;

  return {
    success: true,
    data: {
      amount: amt,
      kioskFee,
      sentAmount,
      fee,
      totalDebited,
      sourceBalance,
      sufficient: totalDebited <= sourceBalance,
      maxAmount: await maxCash(sourceBalance, rate, network),
      sameNetwork,
    },
  };
};
