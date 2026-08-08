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

/** Arrondi à l'entier SUPÉRIEUR : on n'encaisse pas de centimes de FCFA, et
 *  arrondir à l'inférieur ferait payer la différence à la plateforme. */
function withFee(amount, feePercent) {
  const base = toNumber(amount);
  const percent = toNumber(feePercent);
  if (base <= 0 || percent <= 0) return Math.max(0, Math.ceil(base));
  return Math.ceil(base * (1 + percent / 100));
}

/**
 * Frais CONTENUS dans un montant déjà affiché (donc TTC).
 *
 * ⚠️ Ce n'est PAS `montant × 5%` : les 5 % ont été ajoutés en amont, ils sont
 * déjà dedans. On les extrait en divisant. Confondre les deux surévaluerait les
 * frais et fausserait tout le reste du partage (9765 → 488 au lieu de 465).
 */
function feeIncludedIn(ttcAmount, feePercent) {
  const ttc = toNumber(ttcAmount);
  const percent = toNumber(feePercent);
  if (ttc <= 0 || percent <= 0) return 0;
  return Math.max(0, ttc - Math.round(ttc / (1 + percent / 100)));
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
  // ⚠️ `pickupAllowed` n'entre PAS en jeu : il dit que le user peut venir
  // récupérer sur place, pas que la boutique refuse de livrer. Une boutique qui
  // ne livre pas ne déclare simplement aucune zone → 0 naturellement.
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
  if (!zoneName) return maxDeliveryPrice(fastfood, deliveryType);
  const zone = collectZones(fastfood, deliveryType).find(z => z.lieu === zoneName);
  return zone ? toNumber(zone.prix) : maxDeliveryPrice(fastfood, deliveryType);
}

/** Supplément intégré au prix d'un plat, avant frais : livraison + marge. */
function displaySurcharge(fastfood, platformMargin) {
  return maxDeliveryPrice(fastfood) + toNumber(platformMargin);
}

// ── Qui livre la boutique (migration 037) ──────────────────────────────────
// 'fastfood' : régime historique — zone la plus chère, aucun arrondi.
// 'platform' : zones PLATEFORME, prix calé sur un multiple du pas d'arrondi,
//              la course du livreur absorbe la baisse (dans la limite fixée).
const DELIVERY_BY_PLATFORM = 'platform';

/** Vrai si la plateforme assure elle-même la livraison de cette boutique. */
function isPlatformDelivered(fastfood) {
  return fastfood?.deliveryBy === DELIVERY_BY_PLATFORM;
}

/**
 * Boutique vue par le moteur de prix quand la plateforme livre : ses zones sont
 * celles de la PLATEFORME, pas celles de la boutique.
 *
 * On réutilise `deliveryHours` comme porteur pour que `collectZones`,
 * `maxDeliveryPrice` et `zoneDeliveryPrice` fonctionnent sans le savoir — la
 * structure est identique (periodicZones / expressZones par créneau).
 */
function deliverySource(fastfood) {
  if (!isPlatformDelivered(fastfood)) return fastfood;
  return { ...fastfood, deliveryHours: fastfood?.platformDeliveryHours || [] };
}

/**
 * Prix RÉEL des frais de retrait pour un montant donné.
 * Résolu paresseusement : `withdrawalFees.js` importe `toNumber` d'ici, donc on
 * ne le require qu'à l'appel pour ne pas créer de cycle au chargement.
 */
function withdrawalFeeOn(amount, pricing) {
  if (!pricing?.withdrawalFees) return 0;
  const { withdrawalFee } = require('./withdrawalFees');
  return withdrawalFee(amount, pricing.withdrawalFees, pricing.withdrawalOperator);
}

/**
 * Prix affiché d'un montant, TOUS frais inclus : commission de l'agrégateur ET
 * frais de retrait de l'opérateur.
 *
 * ⚠️ Les deux frais ne s'additionnent pas naïvement. La commission est un
 * pourcentage du prix PAYÉ, or le retrait s'applique à ce qui reste APRÈS elle.
 * On résout donc le prix qui, une fois la commission retirée puis le retrait
 * payé, laisse exactement le montant voulu :
 *
 *   payé = (base + frais de retrait) / (1 − commission)
 *
 * Le frais de retrait est estimé sur `base` — le barème étant à seuil, l'écart
 * avec le frais réellement dû reste inférieur au pas d'arrondi et retombe dans
 * la marge plateforme.
 */
function withAllFees(amount, pricing) {
  const base = toNumber(amount);
  if (base <= 0) return 0;

  const percent = toNumber(pricing?.paymentFeePercent);
  const withdrawal = withdrawalFeeOn(base, pricing);
  const gross = base + withdrawal;

  if (percent <= 0 || percent >= 100) return Math.ceil(gross);
  return Math.ceil(gross / (1 - percent / 100));
}

/**
 * Cale un prix sur un multiple du pas.
 *
 * On DESCEND tant que le manque à gagner reste absorbable par la course du
 * livreur (`driverAmortizationMax`) : le client paie un prix rond plus bas. Au
 * delà, on MONTE — le livreur n'a pas à financer l'arrondi, et le surplus
 * revient à la plateforme.
 *
 * ⚠️ Partir du prix juste et arrondir en FIN de chaîne est le seul ordre
 * correct : arrondir le prix brut en amont ferait franchir un pas entier après
 * ajout des frais (2500 → 3500 au lieu de 3000).
 */
function roundToStep(amount, { step, amortizationMax }) {
  const price = toNumber(amount);
  const pas = toNumber(step);
  if (price <= 0 || pas <= 0) return Math.max(0, Math.ceil(price));

  const down = Math.floor(price / pas) * pas;
  const up = Math.ceil(price / pas) * pas;
  if (down === up) return price;

  const shortfall = price - down;
  return shortfall <= toNumber(amortizationMax) && down > 0 ? down : up;
}

/**
 * Applique les prix affichés à un menu (copie, jamais en place).
 * Chaque prix porte ses frais, calculés une seule fois.
 */
function applyDisplayPricingToMenu(menu, { surcharge, pricing, rounding }) {
  if (!menu) return menu;
  const out = { ...menu };

  // Prix TOUS frais inclus : commission agrégateur ET frais de retrait. Le pas
  // d'arrondi n'est appliqué qu'en livraison PLATEFORME (`rounding` absent
  // sinon), et TOUJOURS en dernier — voir `roundToStep`.
  const display = amount => {
    const priced = withAllFees(amount, pricing);
    return rounding ? roundToStep(priced, rounding) : priced;
  };

  // `rawPrice` = le prix RÉEL du fastfood, transporté à côté du prix affiché.
  // Le front le renvoie tel quel dans la commande, ce qui fige le prix de
  // l'époque : le prix affiché n'est PAS inversible (arrondis successifs) et
  // relire le menu plus tard donnerait le prix courant, pas celui payé.
  if (Array.isArray(menu[MENU_PRICES_FIELD])) {
    out[MENU_PRICES_FIELD] = menu[MENU_PRICES_FIELD].map(p => ({
      ...p,
      price: display(toNumber(p?.price) + surcharge),
      rawPrice: toNumber(p?.price),
    }));
  }

  // Extras et boissons ne portent PAS le supplément livraison/marge — il n'est
  // ajouté qu'une fois, par le plat — mais bien leurs propres frais, retrait
  // compris. Jamais d'arrondi au pas : c'est le PLAT qui porte le prix rond, et
  // caler chaque supplément dessus multiplierait les paliers.
  for (const field of ['extra', 'drink']) {
    if (!Array.isArray(menu[field])) continue;
    out[field] = menu[field].map(i => (i?.prix == null ? i : { ...i, prix: withAllFees(i.prix, pricing), rawPrice: toNumber(i.prix) }));
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

  // Livraison PLATEFORME : les zones facturées sont celles de la plateforme.
  const platformDelivered = isPlatformDelivered(fastfood);
  const source = deliverySource(fastfood);
  const surcharge = displaySurcharge(source, platformMargin);

  // Le pas d'arrondi ne vaut QUE pour la livraison plateforme : c'est là que la
  // course du livreur peut absorber la baisse. En régime fastfood, le prix
  // reste au centime près.
  const rounding = platformDelivered
    ? {
        step: toNumber(pricing?.priceRoundingStep),
        amortizationMax: toNumber(pricing?.driverAmortizationMax),
      }
    : null;

  // Renvoyé dans les deux cas : le marchand voit ainsi ce que voit le client,
  // et le front n'a rien à recalculer.
  const meta = {
    surcharge,
    maxDeliveryPrice: maxDeliveryPrice(source),
    platformMargin,
    paymentFeePercent: feePercent,
    deliveryBy: platformDelivered ? DELIVERY_BY_PLATFORM : 'fastfood',
    ...(rounding ? { priceRoundingStep: rounding.step, driverAmortizationMax: rounding.amortizationMax } : {}),
    applied: !raw,
  };

  if (raw) return { ...fastfood, pricing: meta };

  const menus = Array.isArray(fastfood.menus) ? fastfood.menus.map(m => applyDisplayPricingToMenu(m, { surcharge, pricing, rounding })) : fastfood.menus;
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
function splitDeliveryAmounts({ fastfood, zone, deliveryType, platformMargin, quantity = 1, courseBilled = true, delivered = true, freeReason = null }) {
  const qty = Math.max(1, toNumber(quantity) || 1);

  // Facturé au user : le supplément unitaire, autant de fois qu'il y a de plats.
  // Sans filtre de type — c'est bien le maximum tous types confondus qui a été
  // intégré au prix affiché, avant que le user ne choisisse son mode.
  //
  // ⚠️ Facturé MÊME EN RETRAIT : le supplément est fondu dans le prix du plat
  // depuis le home, avant que le user ait choisi. S'il vient chercher lui-même,
  // il n'y a aucune course à payer — le montant part donc intégralement en
  // marge plateforme. C'est le modèle économique retenu, pas un oubli.
  // Livraison PLATEFORME : les zones facturées et versées sont celles de la
  // plateforme, pas celles de la boutique.
  const source = deliverySource(fastfood);
  const chargedPrice = maxDeliveryPrice(source) * qty;

  // Pas de livraison = pas de course : rien n'est dû au fastfood.
  const realPrice = delivered ? zoneDeliveryPrice(source, zone, deliveryType) : 0;
  const due = delivered && courseBilled ? realPrice : 0;

  return {
    zone: delivered ? (zone ?? null) : null,
    realPrice,
    chargedPrice,
    // Sans livraison, aucune course n'est portée par cette commande.
    courseBilled: delivered && courseBilled,
    delivered,
    platformMargin: Math.max(0, chargedPrice - due + toNumber(platformMargin) * qty),
    freeReason,
  };
}

module.exports = {
  MENU_PRICES_FIELD,
  DELIVERY_BY_PLATFORM,
  isPlatformDelivered,
  deliverySource,
  withAllFees,
  roundToStep,
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
