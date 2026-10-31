// ============================================================================
// paymentFees — Frais de PAIEMENT de l'agrégateur actif (source unique)
// ============================================================================
// Tout calcul de prix ou de règlement qui a besoin des frais de paiement passe
// par ici : composer le prix affiché (home), extraire les frais d'un montant
// encaissé (règlement), estimer la couverture d'un surplus d'arrondi.
// Changer d'agrégateur (env `PAYMENT_AGGREGATOR`) bascule le barème sans
// toucher au calcul des prix.
//
// Barèmes (réglages `settings_pricing`, pilotables à chaud) :
//
//   DigiKUNTZ  frais = ⌈5 % × P⌉ — taux TOUT COMPRIS, la commission
//              MobileWallet y est déjà incluse (d'où l'absence de clé séparée).
//              Fonctionnement historique, inchangé.
//
//   pawaPay    frais = ⌈dépôt[n] × P⌉ + ⌈commission MW × P⌉ + ⌈réserve[n] × P⌉
//              chaque frais calculé sur le montant PAYÉ P et arrondi à l'excès
//              SÉPARÉMENT — exactement comme MobileWallet (core/fees.py).
//              `réserve` = frais de retrait prépayés au dépôt : MobileWallet les
//              met de côté pour payer le virement vers le même réseau, qui est
//              ensuite gratuit pour le marchand.
//
// Réseau inconnu (prix affiché sur le home : le client n'a pas encore choisi
// MTN ou Orange) → on prend le réseau le PLUS CHER, pour que les frais soient
// couverts dans tous les cas. L'écart, quand le client paie par l'autre
// réseau, revient à la marge plateforme.
//
// ⚠️ Les frais de retrait OPÉRATEUR (54 F / 1,2 % + 4, `withdrawalFees.js`)
// ne sont PAS ici : ils couvrent le retrait du marchand au kiosque, quel que
// soit l'agrégateur, et s'ajoutent à la base AVANT ces frais.
// ============================================================================

const { AGGREGATORS, resolvePaymentAggregator } = require('../../utils/paymentAggregator');
const { toBalanceKey } = require('../../utils/mobileNetwork');

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ceilPercent = (amount, percent) => (percent > 0 ? Math.ceil((amount * percent) / 100) : 0);

/**
 * Barème résolu. Accepte un `pricing` ancien (sans `paymentFees`) : on
 * retombe alors sur `paymentFeePercent`, au barème DigiKUNTZ.
 */
function scheduleOf(pricing) {
  const pf = pricing?.paymentFees;
  if (!pf) return { aggregator: AGGREGATORS.DIGIKUNTZ, digikuntz: { percent: num(pricing?.paymentFeePercent) } };
  return { ...pf, aggregator: pf.aggregator || resolvePaymentAggregator() };
}

/** Taux pawaPay d'un réseau ('mtn' | 'orange'), en %. */
function pawapayRates(pawapay, key) {
  return {
    deposit: num(pawapay?.deposit?.[key]),
    commission: num(pawapay?.mwCommission),
    reserve: num(pawapay?.payoutReserve?.[key]),
  };
}

/** Réseau pawaPay le plus cher ('mtn' | 'orange') — cas du prix affiché. */
function costliestNetworkKey(pawapay) {
  const total = key => {
    const r = pawapayRates(pawapay, key);
    return r.deposit + r.commission + r.reserve;
  };
  return total('orange') > total('mtn') ? 'orange' : 'mtn';
}

/** Clé de réseau effective : celle du paiement si connue, sinon la plus chère. */
function networkKeyFor(pawapay, network) {
  return toBalanceKey(network) || costliestNetworkKey(pawapay);
}

/**
 * Frais de paiement prélevés sur un montant PAYÉ (TTC).
 *
 * @param {number} paid        montant payé par le client
 * @param {Object} pricing     réglages (`getPricingSettings`)
 * @param {Object} [opts]
 * @param {string} [opts.network]    réseau du paiement ; absent = le plus cher
 * @param {string} [opts.aggregator] agrégateur du paiement ; absent = l'actif
 * @returns {number} frais (FCFA), entier, jamais négatif
 */
function paymentFeeOf(paid, pricing, { network, aggregator } = {}) {
  const p = num(paid);
  if (p <= 0) return 0;
  const s = scheduleOf(pricing);
  const agg = aggregator || s.aggregator;

  if (agg === AGGREGATORS.PAWAPAY) {
    const r = pawapayRates(s.pawapay, networkKeyFor(s.pawapay, network));
    return ceilPercent(p, r.deposit) + ceilPercent(p, r.commission) + ceilPercent(p, r.reserve);
  }
  return Math.max(0, ceilPercent(p, num(s.digikuntz?.percent)));
}

/**
 * Somme des taux, en % du montant payé (réseau le plus cher si non précisé).
 * Sert aux estimations linéaires (couverture d'un surplus d'arrondi).
 */
function paymentFeePercentOf(pricing, { network } = {}) {
  const s = scheduleOf(pricing);
  if (s.aggregator === AGGREGATORS.PAWAPAY) {
    const r = pawapayRates(s.pawapay, networkKeyFor(s.pawapay, network));
    return r.deposit + r.commission + r.reserve;
  }
  return num(s.digikuntz?.percent);
}

/**
 * Plus petit montant payé P qui, une fois les frais de paiement prélevés,
 * laisse au moins `net`. C'est le prix « frais de paiement inclus ».
 *
 * DigiKUNTZ : formule historique inchangée, P = ⌈net / (1 − taux)⌉.
 * pawaPay   : chaque frais étant arrondi à l'excès séparément, la formule
 *             linéaire peut manquer d'un ou deux francs : on part d'elle et
 *             on monte jusqu'à couvrir `net` exactement.
 */
function grossUpForPaymentFees(net, pricing) {
  const base = num(net);
  if (base <= 0) return 0;
  const s = scheduleOf(pricing);
  const percent = paymentFeePercentOf(pricing);
  if (percent <= 0 || percent >= 100) return Math.ceil(base);

  let paid = Math.ceil(base / (1 - percent / 100));
  if (s.aggregator !== AGGREGATORS.PAWAPAY) return paid;

  // Au plus 3 arrondis d'excès (un par frais) : la boucle est bornée.
  while (paid - paymentFeeOf(paid, pricing) < base) paid += 1;
  return paid;
}

module.exports = {
  paymentFeeOf,
  paymentFeePercentOf,
  grossUpForPaymentFees,
  costliestNetworkKey,
};
