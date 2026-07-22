// ============================================================================
// deliveryPricing — Prix AFFICHÉ vs prix RÉEL
// ============================================================================
// Règle centrale : **le prix affiché est calculé, le prix réel est stocké.**
// On ne gonfle JAMAIS un prix en base. Le catalogue garde les prix du fastfood ;
// l'ajout (livraison + marge + frais) se fait à la lecture, comme `isMarchand`.
//
//   plat affiché    = ceil( (prix plat + livraison la plus chère + marge) × 1.05 )
//   extra affiché   = ceil( prix extra   × 1.05 )
//   boisson affiché = ceil( prix boisson × 1.05 )
//
// Le total payé est la simple SOMME de ce que le user voit : **aucune ligne de
// frais n'est jamais ajoutée à la fin**. Le user paie tout sans le savoir.
// Les 5 % sont appliqués UNE fois par prix, jamais multipliés par la quantité.
//
// Pourquoi la livraison la plus chère : une boutique a plusieurs zones à des
// prix différents, et le home ne sait pas encore où le user se fera livrer. En
// prenant le maximum, le prix annoncé couvre toutes les zones — il ne peut
// jamais manquer. Si le user choisit ensuite une zone moins chère, l'écart reste
// à la plateforme.
//
// ⚠️ On ne retrouve JAMAIS un prix réel en inversant le calcul : l'arrondi au
// supérieur rend l'opération non réversible (plat 25 → affiché 1182 → l'inverse
// donne 25,71). Le prix réel est servi tel quel depuis la base.
// ============================================================================

// Emplacement RÉEL des prix d'un menu. Les colonnes `prix1/prix2/prix3` du
// mapper sont NULL sur toute la base : c'est `prices[]` qui fait foi.
const MENU_PRICES_FIELD = 'prices';

/** Les prix de zone sont stockés en chaîne ("500") : on normalise sans jamais renvoyer NaN. */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Prix affiché = montant dont les frais représentent EXACTEMENT `feePercent`.
 *
 * On divise, on ne multiplie pas : à 5 %, `base × 1.05` donne des frais de
 * 4,76 % du prix final — le prestataire prélève sur ce qu'il ENCAISSE, la
 * différence serait perdue par la plateforme.
 * Arrondi au supérieur : on n'encaisse pas de centimes de FCFA.
 */
function withFee(amount, feePercent) {
  const base = toNumber(amount);
  const percent = toNumber(feePercent);
  if (base <= 0) return 0;
  if (percent <= 0 || percent >= 100) return Math.ceil(base);
  return Math.ceil(base / (1 - percent / 100));
}

/** Frais CONTENUS dans un montant déjà affiché : exactement `feePercent` de lui. */
function feeIncludedIn(ttcAmount, feePercent) {
  const ttc = toNumber(ttcAmount);
  const percent = toNumber(feePercent);
  if (ttc <= 0 || percent <= 0) return 0;
  return Math.min(ttc, Math.round((ttc * percent) / 100));
}

// Type de livraison (orders.delivery.type) → liste de zones correspondante.
// Un même lieu existe dans les DEUX listes à des prix différents : l'express
// coûte plus cher. Confondre les deux crédite le fastfood du mauvais montant.
const ZONES_BY_DELIVERY_TYPE = { express: 'expressZones', time: 'periodicZones' };

/**
 * Zones d'une boutique.
 * @param {string} [deliveryType] `express` | `time` — omis, les deux listes.
 */
function collectZones(fastfood, deliveryType) {
  const hours = Array.isArray(fastfood?.deliveryHours) ? fastfood.deliveryHours : [];
  const field = ZONES_BY_DELIVERY_TYPE[deliveryType];
  const zones = [];
  for (const h of hours) {
    // Le format legacy est un simple "HH:mm" : aucune zone à en tirer.
    if (!h || typeof h !== 'object') continue;
    const lists = field ? [h[field]] : [h.periodicZones, h.expressZones];
    for (const list of lists) {
      if (Array.isArray(list)) zones.push(...list);
    }
  }
  return zones.filter(Boolean);
}

/**
 * Livraison la plus chère. Sans type précisé, le maximum est pris sur les DEUX
 * listes : au moment du home le user n'a pas encore choisi son mode de
 * livraison, le prix annoncé doit donc couvrir le cas le plus cher.
 */
function maxDeliveryPrice(fastfood, deliveryType) {
  if (fastfood?.pickupOnly) return 0;
  const zones = collectZones(fastfood, deliveryType);
  if (zones.length === 0) return 0;
  return zones.reduce((max, z) => Math.max(max, toNumber(z.prix)), 0);
}

/**
 * Prix réel de la zone choisie — ce que touche le fastfood.
 *
 * ⚠️ La recherche est filtrée par le TYPE de livraison : « Bonanjo » peut valoir
 * 500 en périodique et 900 en express. Sans ce filtre, une course express était
 * créditée au tarif périodique, et l'écart tombait dans la marge plateforme.
 *
 * Zone introuvable : on retombe sur la plus chère du même type, jamais sur 0,
 * pour ne pas créditer la plateforme d'une marge qu'elle n'a pas gagnée.
 */
function zoneDeliveryPrice(fastfood, zoneName, deliveryType) {
  if (fastfood?.pickupOnly) return 0;
  if (!zoneName) return maxDeliveryPrice(fastfood, deliveryType);
  const zone = collectZones(fastfood, deliveryType).find(z => z.lieu === zoneName);
  return zone ? toNumber(zone.prix) : maxDeliveryPrice(fastfood, deliveryType);
}

/** Supplément intégré au prix d'un plat, avant frais : livraison + marge. */
function displaySurcharge(fastfood, platformMargin) {
  return maxDeliveryPrice(fastfood) + toNumber(platformMargin);
}

/**
 * Applique les prix affichés à un menu (copie, jamais en place).
 * Chaque prix porte ses frais, calculés une seule fois.
 */
function applyDisplayPricingToMenu(menu, { surcharge, feePercent }) {
  if (!menu) return menu;
  const out = { ...menu };

  if (Array.isArray(menu[MENU_PRICES_FIELD])) {
    out[MENU_PRICES_FIELD] = menu[MENU_PRICES_FIELD].map(p => ({
      ...p,
      price: withFee(toNumber(p?.price) + surcharge, feePercent),
    }));
  }

  // Extras et boissons ne portent PAS le supplément livraison/marge — il n'est
  // ajouté qu'une fois, par le plat — mais bien leurs propres frais.
  for (const field of ['extra', 'drink']) {
    if (!Array.isArray(menu[field])) continue;
    out[field] = menu[field].map(i => (i?.prix == null ? i : { ...i, prix: withFee(i.prix, feePercent) }));
  }

  return out;
}

/**
 * Enrichit une boutique de ses prix affichés.
 *
 * @param {Object} fastfood        boutique avec ses `menus`
 * @param {Object} pricing         { platformMargin, paymentFeePercent }
 * @param {boolean} [raw=false]    true → prix RÉELS conservés (vue marchand)
 */
function applyDisplayPricing(fastfood, pricing, raw = false) {
  if (!fastfood) return fastfood;

  const platformMargin = toNumber(pricing?.platformMargin);
  const feePercent = toNumber(pricing?.paymentFeePercent);
  const surcharge = displaySurcharge(fastfood, platformMargin);

  // Renvoyé dans les deux cas : le marchand voit ainsi ce que voit le client,
  // et le front n'a rien à recalculer.
  const meta = {
    surcharge,
    maxDeliveryPrice: maxDeliveryPrice(fastfood),
    platformMargin,
    paymentFeePercent: feePercent,
    applied: !raw,
  };

  if (raw) return { ...fastfood, pricing: meta };

  const menus = Array.isArray(fastfood.menus) ? fastfood.menus.map(m => applyDisplayPricingToMenu(m, { surcharge, feePercent })) : fastfood.menus;
  return { ...fastfood, menus, pricing: meta };
}

/**
 * Répartition d'une commande livrée, pour `order_deliveries`.
 *
 * ⚠️ **Asymétrie voulue** : le supplément est porté par le prix unitaire du
 * plat, donc facturé sur CHAQUE exemplaire (`× quantity`) ; le fastfood, lui,
 * ne touche qu'UNE course par panier et par boutique. Tout l'écart revient à la
 * plateforme — c'est le levier de marge.
 *
 * `courseBilled: false` → cette commande partage la course d'une autre du même
 * panier. `realPrice` reste renseigné (traçabilité), mais n'est pas dû.
 *
 * `platformMargin` est plafonné à 0 par le bas : une gratuité fait renoncer à un
 * gain, elle ne crée jamais une dépense (contrainte SQL identique côté base).
 */
function splitDeliveryAmounts({ fastfood, zone, deliveryType, platformMargin, quantity = 1, courseBilled = true, freeReason = null }) {
  const qty = Math.max(1, toNumber(quantity) || 1);

  // Facturé au user : le supplément unitaire, autant de fois qu'il y a de plats.
  // Sans filtre de type — c'est bien le maximum tous types confondus qui a été
  // intégré au prix affiché, avant que le user ne choisisse son mode.
  const chargedPrice = maxDeliveryPrice(fastfood) * qty;
  // Prix réel de la zone, au tarif du TYPE réellement choisi.
  const realPrice = zoneDeliveryPrice(fastfood, zone, deliveryType);
  const due = courseBilled ? realPrice : 0;

  return {
    zone: zone ?? null,
    realPrice,
    chargedPrice,
    courseBilled,
    platformMargin: Math.max(0, chargedPrice - due + toNumber(platformMargin) * qty),
    freeReason,
  };
}

module.exports = {
  MENU_PRICES_FIELD,
  toNumber,
  withFee,
  feeIncludedIn,
  collectZones,
  maxDeliveryPrice,
  zoneDeliveryPrice,
  displaySurcharge,
  applyDisplayPricingToMenu,
  applyDisplayPricing,
  splitDeliveryAmounts,
};
