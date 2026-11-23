// toNumber — nombre sûr depuis une valeur libre (prix de zone stockés en chaîne).
// Utilisé par tout le moteur de prix (`services/pricing/*`), réexporté par `deliveryPricing`.

/** Les prix de zone sont stockés en chaîne ("500") : on normalise sans jamais renvoyer NaN. */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { toNumber };
