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
// ============================================================================
const { applyDisplayPricing, toNumber } = require('./deliveryPricing');
const { withdrawalFee, OPERATORS } = require('./withdrawalFees');
const { validateMenuPrices } = require('./menuPriceGuard');

function previewMenuPrice(brut, fastfood, pricing) {
  const price = toNumber(brut);
  if (price <= 0) return null;

  const priced = applyDisplayPricing({ ...fastfood, menus: [{ prices: [{ price }] }] }, pricing);
  const displayed = toNumber(priced?.menus?.[0]?.prices?.[0]?.price);

  const fees = pricing?.withdrawalFees;
  const withdrawal = fees ? Math.max(...OPERATORS.map(op => withdrawalFee(price, fees, op))) : 0;

  const errors = validateMenuPrices({ prices: [{ price }] }, fastfood, pricing);

  return {
    price,
    displayedPrice: displayed,
    withdrawalFee: withdrawal,
    merchantReceives: price + withdrawal,
    accepted: errors.length === 0,
    message: errors[0]?.message || null,
  };
}

module.exports = { previewMenuPrice };
