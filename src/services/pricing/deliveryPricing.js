// ============================================================================
// deliveryPricing — Prix AFFICHÉ vs prix RÉEL
// ============================================================================
// Règle centrale : **le prix affiché est calculé, le prix réel est stocké.**
// On ne gonfle JAMAIS un prix en base. Le catalogue garde les prix du fastfood ;
// l'ajout (livraison + marge) se fait à la lecture, comme `isMarchand`.
//
// Composition du prix affiché d'un plat :
//     prix affiché = prix fastfood + livraison LA PLUS CHÈRE + marge plateforme
//
// Pourquoi la plus chère : une boutique a plusieurs zones à des prix différents,
// et le home ne sait pas encore où le user se fera livrer. En prenant le maximum,
// le prix annoncé couvre toutes les zones — il ne peut jamais manquer. Si le user
// choisit ensuite une zone moins chère, l'écart reste à la plateforme.
//
// Exemple : plat 2000, zones 500/800/1000, marge 100
//   affiché        = 2000 + 1000 + 100 = 3100
//   zone choisie   = 500
//   → fastfood     = 2000 + 500 = 2500
//   → plateforme   = (1000 − 500) + 100 = 600
//   → user paie    = 3100 (+ frais de paiement), et n'a jamais vu la livraison
//
// ⚠️ Le user paie le MÊME montant que la livraison soit offerte ou non : la
// gratuité est un renoncement de marge, pas une remise. C'est `deliveryOffer`
// qui dit au front d'afficher « livraison offerte ».
// ============================================================================

// Champs de prix d'un menu (cf. interface/menuFields.js).
const MENU_PRICE_FIELDS = ['prix1', 'prix2', 'prix3'];

/** Les prix de zone sont stockés en chaîne ("500") : on normalise sans jamais renvoyer NaN. */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Toutes les zones d'une boutique, périodiques et express confondues. */
function collectZones(fastfood) {
  const hours = Array.isArray(fastfood?.deliveryHours) ? fastfood.deliveryHours : [];
  const zones = [];
  for (const h of hours) {
    // Le format legacy est un simple "HH:mm" : aucune zone à en tirer.
    if (!h || typeof h !== 'object') continue;
    for (const list of [h.periodicZones, h.expressZones]) {
      if (Array.isArray(list)) zones.push(...list);
    }
  }
  return zones.filter(Boolean);
}

/** Livraison la plus chère de la boutique. 0 si aucune zone déclarée. */
function maxDeliveryPrice(fastfood) {
  const zones = collectZones(fastfood);
  if (zones.length === 0) return 0;
  return zones.reduce((max, z) => Math.max(max, toNumber(z.prix)), 0);
}

/**
 * Prix réel de la zone choisie par le user — ce que touche le fastfood.
 * Zone inconnue : on retombe sur la plus chère, jamais sur 0, pour ne pas
 * créditer la plateforme d'une marge qu'elle n'a pas gagnée.
 */
function zoneDeliveryPrice(fastfood, zoneName) {
  if (!zoneName) return maxDeliveryPrice(fastfood);
  const zone = collectZones(fastfood).find(z => z.lieu === zoneName);
  return zone ? toNumber(zone.prix) : maxDeliveryPrice(fastfood);
}

/**
 * Supplément intégré au prix affiché d'un plat : livraison la plus chère + marge.
 * Une boutique en retrait seul (`pickupOnly`) n'a pas de livraison à répercuter.
 */
function displaySurcharge(fastfood, platformMargin) {
  const delivery = fastfood?.pickupOnly ? 0 : maxDeliveryPrice(fastfood);
  return delivery + toNumber(platformMargin);
}

/**
 * Applique le supplément aux prix d'un menu (copie, jamais en place).
 * Les `extra` et `drink` ne sont PAS majorés : le supplément est porté une seule
 * fois, par le plat.
 */
function applySurchargeToMenu(menu, surcharge) {
  if (!menu || surcharge === 0) return menu;
  const out = { ...menu };
  for (const field of MENU_PRICE_FIELDS) {
    if (out[field] === null || out[field] === undefined || out[field] === '') continue;
    out[field] = toNumber(out[field]) + surcharge;
  }
  return out;
}

/**
 * Enrichit une boutique de ses prix affichés.
 *
 * @param {Object} fastfood       boutique avec ses `menus`
 * @param {number} platformMargin marge plateforme (settings)
 * @param {boolean} [raw=false]   true → prix RÉELS conservés (vue marchand)
 */
function applyDisplayPricing(fastfood, platformMargin, raw = false) {
  if (!fastfood) return fastfood;

  const surcharge = displaySurcharge(fastfood, platformMargin);

  // `pricing` est renvoyé dans les deux cas : c'est ce qui permet au marchand de
  // voir ce que le client voit, et au front de ne pas avoir à recalculer.
  const pricing = {
    surcharge,
    maxDeliveryPrice: fastfood.pickupOnly ? 0 : maxDeliveryPrice(fastfood),
    platformMargin: toNumber(platformMargin),
    applied: !raw && surcharge > 0,
  };

  if (raw || surcharge === 0) return { ...fastfood, pricing };

  const menus = Array.isArray(fastfood.menus) ? fastfood.menus.map(m => applySurchargeToMenu(m, surcharge)) : fastfood.menus;
  return { ...fastfood, menus, pricing };
}

/**
 * Frais du prestataire de paiement. Arrondi à l'entier SUPÉRIEUR : on ne peut
 * pas encaisser des centimes de FCFA, et arrondir à l'inférieur ferait payer la
 * différence à la plateforme.
 *
 * ⚠️ Ces frais ne reviennent PAS à Yaammoo : ils vont au prestataire.
 */
function computePaymentFee(amount, feePercent) {
  const base = toNumber(amount);
  const percent = toNumber(feePercent);
  if (base <= 0 || percent <= 0) return 0;
  return Math.ceil((base * percent) / 100);
}

/**
 * Répartition d'une commande livrée, pour `order_deliveries`.
 *
 * ⚠️ **Asymétrie voulue, pas un bug** : le supplément est porté par le prix
 * unitaire, donc facturé sur CHAQUE plat (`× quantity`) ; le fastfood, lui, ne
 * touche qu'UNE seule course (la zone choisie, quelle que soit la quantité).
 * Tout l'écart revient à la plateforme — c'est le levier de marge.
 *
 * Exemple : plat 2000, zones 500/800/1000, marge 100, quantité 2
 *   facturé au user  = 2 × 1100 = 2200
 *   versé au fastfood =       500 (une seule course)
 *   marge plateforme  =      1700
 *
 * `platformMargin` est plafonné à 0 par le bas : une gratuité fait renoncer à un
 * gain, elle ne crée jamais une dépense (contrainte SQL identique côté base).
 */
function splitDeliveryAmounts({ fastfood, zone, platformMargin, quantity = 1, freeReason = null }) {
  const qty = Math.max(1, toNumber(quantity) || 1);

  // Facturé au user : le supplément unitaire, autant de fois qu'il y a de plats.
  const chargedPrice = fastfood?.pickupOnly ? 0 : maxDeliveryPrice(fastfood) * qty;
  // Versé au fastfood : la course réelle, UNE seule fois.
  const realPrice = fastfood?.pickupOnly ? 0 : zoneDeliveryPrice(fastfood, zone);

  return {
    zone: zone ?? null,
    realPrice,
    chargedPrice,
    platformMargin: Math.max(0, chargedPrice - realPrice + toNumber(platformMargin) * qty),
    freeReason,
  };
}

module.exports = {
  MENU_PRICE_FIELDS,
  collectZones,
  maxDeliveryPrice,
  zoneDeliveryPrice,
  displaySurcharge,
  applySurchargeToMenu,
  applyDisplayPricing,
  computePaymentFee,
  splitDeliveryAmounts,
};
