// ============================================================================
// menuPricePreview — aperçu d'un prix de menu pendant sa saisie (vue marchand)
// ============================================================================
// Le marchand tape un prix brut : on lui renvoie, calculés ICI (jamais côté
// app), le prix affiché au client, le frais de retrait espèces qui lui est
// reversé, ce qu'il recevra, et le verdict du garde-fou `menuPriceGuard`.
//
// - Prix affiché : la chaîne réelle du catalogue (`applyDisplayPricing`), sur
//   une boutique fictive ne portant que ce prix : même régime, même arrondi.
// - Frais de retrait : barème du réseau le PLUS CHER (réseau inconnu à la
//   saisie), sur le prix réel du plat — c'est la part kiosque du crédit
//   marchand (`items_real + withdrawal_fee`, cf. money-rules.md §2).
// - Vous recevez = prix du plat + frais de retrait (hors course).
// - Prix refusé par le garde-fou : montants à null, seul `message` est utile.
// - `feePayer = merchant` (money-rules.md §2 bis) : prix affiché = brut ;
//   Vous recevez = brut − frais − marge + course la MOINS chère − ses frais ;
//   `withdrawalFee` porte alors le total retenu (frais + marge), `course` la
//   course prise pour l'aperçu.
// ============================================================================
const { applyDisplayPricing, toNumber } = require('./deliveryPricing');
const { withdrawalFee, OPERATORS } = require('./withdrawalFees');
const { validateMenuPrices } = require('./menuPriceGuard');
const { minDeliveryPrice } = require('./deliveryZones');
const { paymentFeeOf } = require('./paymentFees');
const { merchantNetOf, merchantPays, normalizeFeePayer, effectiveFeePayer } = require('./feePayer');

function previewMenuPrice(brut, fastfood, pricing, feePayerIn = 'client') {
  const price = toNumber(brut);
  if (price <= 0) return null;
  const asked = normalizeFeePayer(feePayerIn);
  if (merchantPays(asked)) return previewMerchantPays(price, asked, fastfood, pricing);

  const priced = applyDisplayPricing({ ...fastfood, menus: [{ prices: [{ price }] }] }, pricing);
  const displayed = toNumber(priced?.menus?.[0]?.prices?.[0]?.price);

  const fees = pricing?.withdrawalFees;
  const withdrawal = fees ? Math.max(...OPERATORS.map(op => withdrawalFee(price, fees, op))) : 0;

  const errors = validateMenuPrices({ prices: [{ price }] }, fastfood, pricing);
  // Prix refusé : aucun montant (il ne sera jamais affiché ni payé).
  if (errors.length) {
    return {
      price,
      displayedPrice: null,
      withdrawalFee: null,
      merchantReceives: null,
      accepted: false,
      message: errors[0].message,
    };
  }

  return {
    price,
    displayedPrice: displayed,
    withdrawalFee: withdrawal,
    merchantReceives: price + withdrawal,
    accepted: true,
    message: null,
  };
}

/** Aperçu d'un prix dont le MARCHAND paie les frais (money-rules.md §2 bis). */
function previewMerchantPays(price, feePayer, fastfood, pricing) {
  const refused = message => ({ price, displayedPrice: null, withdrawalFee: null, merchantReceives: null, course: null, feePayer, accepted: false, message });
  const errors = validateMenuPrices({ prices: [{ price, feePayer }] }, fastfood, pricing, { prices: [{ feePayer }] });
  if (errors.length) return refused(errors[0].message);
  // Régime plateforme : `validateMenuPrices` l'a déjà refusé ; garde-fou en plus.
  if (effectiveFeePayer(feePayer, fastfood) !== feePayer) return refused('Choix indisponible pour cette boutique.');

  const course = minDeliveryPrice(fastfood);
  const courseNet = course > 0 ? course - paymentFeeOf(course, pricing) : 0;
  const receives = merchantNetOf(price, feePayer, pricing) + courseNet;
  return {
    price,
    displayedPrice: price,
    withdrawalFee: price + course - receives,
    merchantReceives: receives,
    course,
    feePayer,
    accepted: true,
    message: null,
  };
}

module.exports = { previewMenuPrice };
