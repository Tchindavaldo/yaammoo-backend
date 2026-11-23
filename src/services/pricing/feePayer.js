// ============================================================================
// feePayer — Qui paie les frais d'un prix de plat ou d'une boisson
// ============================================================================
// Règle (architecture/money-rules.md §2 bis) :
//   client              prix affiché = brut + marge + frais (arrondi au pas)  — défaut
//   merchant            prix affiché = brut ; marchand = brut − frais − marge
//   merchant_no_margin  prix affiché = brut ; marchand = brut − frais ; marge 0
//                       (backend seul : paiement au restaurant, à venir)
// Porté par `menu.prices[].feePayer` et `fastfoods.drinks[].feePayer`. Les
// extras d'une commande suivent le prix CHOISI. Régime plateforme : toujours
// `client` (la course fondue dans le prix ne serait plus payée).
// Utilisé par : deliveryPricing (affichage), repriceCart (panier / precheck),
// settleDelivery (règlement), menuPriceGuard + validatMenu (enregistrement),
// menuPricePreview (aperçu « Vous recevez »).
// ============================================================================
const { toNumber } = require('../../utils/toNumber');
const { paymentFeeOf } = require('./paymentFees');

const FEE_PAYER_CLIENT = 'client';
const FEE_PAYER_MERCHANT = 'merchant';
const FEE_PAYER_MERCHANT_NO_MARGIN = 'merchant_no_margin';
const FEE_PAYERS = [FEE_PAYER_CLIENT, FEE_PAYER_MERCHANT, FEE_PAYER_MERCHANT_NO_MARGIN];

const PLATFORM_REFUSED = 'Le choix « le marchand paie les frais » n’est pas disponible pour une boutique livrée par Yaammoo.';
const NO_MARGIN_REFUSED = 'Le mode « frais sans marge » est réservé à Yaammoo.';

/** Valeur stockée → valeur connue ; absente ou inconnue = `client`. */
function normalizeFeePayer(value) {
  return FEE_PAYERS.includes(value) ? value : FEE_PAYER_CLIENT;
}

/** Vrai si le régime EFFECTIF est la livraison plateforme (lazy : pas de cycle). */
function platformOf(fastfood) {
  return require('./deliveryPricing').isPlatformDelivered(fastfood);
}

/** Valeur appliquée : `client` en régime plateforme, quoi qu'il soit stocké. */
function effectiveFeePayer(value, fastfood) {
  return platformOf(fastfood) ? FEE_PAYER_CLIENT : normalizeFeePayer(value);
}

const merchantPays = feePayer => feePayer === FEE_PAYER_MERCHANT || feePayer === FEE_PAYER_MERCHANT_NO_MARGIN;

/** Marge due sur une ligne payée par le marchand (0 en `merchant_no_margin`). */
function merchantMarginOf(feePayer, brut, pricing) {
  if (feePayer !== FEE_PAYER_MERCHANT) return 0;
  return require('./deliveryPricing').marginForBrut(brut, pricing);
}

/**
 * Ce que le marchand reçoit pour un prix brut qu'il paie lui-même :
 * brut − frais de paiement (barème du paiement, réseau le plus cher sans
 * contexte) − marge (selon le mode). Peut être ≤ 0 : l'appelant le refuse.
 */
function merchantNetOf(brut, feePayer, pricing, payment = null) {
  const b = toNumber(brut);
  if (b <= 0) return 0;
  const fee = paymentFeeOf(b, pricing, { network: payment?.network, aggregator: payment?.aggregator });
  return b - fee - merchantMarginOf(feePayer, b, pricing);
}

/**
 * Contrôle à l'enregistrement d'un menu (POST / PUT, WhatsApp IA).
 * @param {Object} menu      données reçues (au moins `prices[]`)
 * @param {Object} fastfood  boutique (régime)
 * @param {Object} pricing   réglages tarifaires
 * @param {Object} [previous] menu en base (PUT) : `merchant_no_margin` ne peut
 *   pas être posé depuis l'app, seulement conservé s'il l'était déjà.
 * @returns {Array<{field:string, message:string}>}
 */
function validateMenuFeePayers(menu, fastfood, pricing, previous = null) {
  const prices = menu?.prices;
  if (!Array.isArray(prices)) return [];
  const errors = [];
  prices.forEach((entry, index) => {
    const fp = entry?.feePayer;
    if (fp == null || fp === FEE_PAYER_CLIENT) return;
    const field = `prices[${index}].feePayer`;
    if (!FEE_PAYERS.includes(fp)) return errors.push({ field, message: `Valeur invalide pour "feePayer" : ${fp}` });
    if (platformOf(fastfood)) return errors.push({ field, message: PLATFORM_REFUSED });
    if (fp === FEE_PAYER_MERCHANT_NO_MARGIN && previous?.prices?.[index]?.feePayer !== FEE_PAYER_MERCHANT_NO_MARGIN) {
      return errors.push({ field, message: NO_MARGIN_REFUSED });
    }
    const brut = toNumber(entry?.price);
    if (brut > 0 && merchantNetOf(brut, fp, pricing) <= 0) {
      errors.push({ field: `prices[${index}].price`, message: `Le prix ${brut} F est trop bas pour que vous payiez les frais : vous ne recevriez rien.` });
    }
  });
  return errors;
}

/** Contrôle des boissons de la boutique (`fastfoods.drinks[].feePayer`). */
function validateDrinkFeePayers(drinks, fastfood, pricing, previousDrinks = []) {
  if (!Array.isArray(drinks)) return [];
  const errors = [];
  drinks.forEach((d, index) => {
    const fp = d?.feePayer;
    if (fp == null || fp === FEE_PAYER_CLIENT) return;
    const field = `drinks[${index}].feePayer`;
    if (!FEE_PAYERS.includes(fp)) return errors.push({ field, message: `Valeur invalide pour "feePayer" : ${fp}` });
    if (platformOf(fastfood)) return errors.push({ field, message: PLATFORM_REFUSED });
    const before = (previousDrinks || []).find(p => (d?.id && p?.id === d.id) || p?.name === d?.name);
    if (fp === FEE_PAYER_MERCHANT_NO_MARGIN && before?.feePayer !== FEE_PAYER_MERCHANT_NO_MARGIN) {
      return errors.push({ field, message: NO_MARGIN_REFUSED });
    }
    const brut = toNumber(d?.prix);
    if (brut > 0 && merchantNetOf(brut, fp, pricing) <= 0) {
      errors.push({ field: `drinks[${index}].prix`, message: `La boisson ${d?.name ?? ''} à ${brut} F est trop basse pour que vous payiez les frais.` });
    }
  });
  return errors;
}

/** `feePayer` du prix choisi dans une liste de prix (base 1, comme les commandes). */
function selectedPriceFeePayer(prices, selectedPriceIndex, fastfood) {
  const idx = Math.max(0, toNumber(selectedPriceIndex) - 1);
  return effectiveFeePayer(Array.isArray(prices) ? prices[idx]?.feePayer : undefined, fastfood);
}

/**
 * Règlement d'une commande, ligne par ligne (money-rules.md §2 bis).
 * Plat + extras suivent `pricePayer` (prix choisi) ; chaque boisson suit
 * `drinkPayerOf(name)`. Montants BRUTS figés dans la commande (`rawPrice`).
 *
 *   itemsReal = bruts(client) + bruts(marchand) − frais(bruts marchand) − marge
 *
 * @returns {{ clientRaw:number, merchantRaw:number, merchantFee:number,
 *             merchantMargin:number, itemsReal:number }}
 */
function orderFeeSplit(order, { pricePayer, drinkPayerOf, unitBrut, pricing, payment = null }) {
  const qty = Math.max(1, toNumber(order?.quantity) || 1);
  const rawOf = it => toNumber(it?.rawPrice ?? it?.prix);
  let clientRaw = 0;
  let merchantRaw = 0;
  const add = (payer, amount) => {
    if (merchantPays(payer)) merchantRaw += amount;
    else clientRaw += amount;
  };

  add(pricePayer, toNumber(unitBrut) * qty);
  for (const e of order?.extra || []) if (e?.status === true) add(pricePayer, rawOf(e));
  for (const d of order?.drink || []) {
    if (d?.status !== true) continue;
    add(drinkPayerOf(d?.name), rawOf(d) * Math.max(1, toNumber(d?.quantite) || 1));
  }

  // Marge : portée par le PLAT seul (extras et boissons n'en ont jamais).
  const merchantMargin = merchantPays(pricePayer) ? merchantMarginOf(pricePayer, unitBrut, pricing) * qty : 0;
  const merchantFee = merchantRaw > 0 ? paymentFeeOf(merchantRaw, pricing, { network: payment?.network, aggregator: payment?.aggregator }) : 0;
  return { clientRaw, merchantRaw, merchantFee, merchantMargin, itemsReal: clientRaw + merchantRaw - merchantFee - merchantMargin };
}

module.exports = {
  orderFeeSplit,
  FEE_PAYER_CLIENT,
  FEE_PAYER_MERCHANT,
  FEE_PAYER_MERCHANT_NO_MARGIN,
  FEE_PAYERS,
  normalizeFeePayer,
  effectiveFeePayer,
  merchantPays,
  merchantMarginOf,
  merchantNetOf,
  validateMenuFeePayers,
  validateDrinkFeePayers,
  selectedPriceFeePayer,
};
