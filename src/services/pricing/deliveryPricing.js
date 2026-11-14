// ============================================================================
// deliveryPricing — Prix AFFICHÉ vs prix RÉEL
// ============================================================================
// Règle centrale : **le prix affiché est calculé, le prix réel est stocké.**
// On ne gonfle JAMAIS un prix en base. Le catalogue garde les prix du fastfood ;
// l'ajout (livraison + marge + frais) se fait à la lecture, comme `isMarchand`.
//
//   base            = prix plat + livraison la plus chère + marge
//   plat affiché    = ceil( (base + frais de retrait) / (1 − commission) )
//   extra affiché   = ceil( (prix extra   + frais de retrait) / (1 − commission) )
//   boisson affiché = ceil( (prix boisson + frais de retrait) / (1 − commission) )
//
// Le total payé est la simple SOMME de ce que le user voit : **aucune ligne de
// frais n'est jamais ajoutée à la fin**. Le user paie tout sans le savoir.
// Les frais sont appliqués UNE fois par prix, jamais multipliés par la quantité.
//
// ⚠️ On DIVISE par (1 − commission), on ne multiplie pas par (1 + commission) :
// l'agrégateur prélève son pourcentage sur le montant qu'il ENCAISSE. Pour qu'il
// reste 2404 après sa part, il faut lui envoyer 2404 / 0,95 = 2531 — et non
// 2404 × 1,05 = 2524, qui ne laisserait que 2398.
//
// La « commission » est celle de l'agrégateur ACTIF, résolue par
// `paymentFees.js` : 5 % tout compris chez DigiKUNTZ ; dépôt + commission
// MobileWallet + réserve de retrait chez pawaPay (réseau le plus cher sur le
// home, chaque frais arrondi à l'excès séparément).
//
// ⚠️ En livraison PLATEFORME, le prix est ensuite calé sur un multiple du pas
// d'arrondi — TOUJOURS en dernier (cf. `roundToStep`).
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

const { grossUpForPaymentFees, paymentFeePercentOf } = require('./paymentFees');

// Emplacement RÉEL des prix d'un menu. Les colonnes `prix1/prix2/prix3` du
// mapper sont NULL sur toute la base : c'est `prices[]` qui fait foi.
const MENU_PRICES_FIELD = 'prices';

/** Les prix de zone sont stockés en chaîne ("500") : on normalise sans jamais renvoyer NaN. */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Commission prélevée par l'agrégateur sur un montant encaissé.
 *
 * ⚠️ Le pourcentage porte sur le montant PAYÉ, pas sur une base hors frais :
 * MobileWallet reçoit 2531 et en prélève 5 %, soit 127 — il ne cherche pas
 * quelle base aurait donné 2531 une fois majorée.
 *
 * C'est la même convention que `withAllFees`, qui compose le prix en divisant
 * par `(1 − commission)`. Les deux doivent rester cohérentes : sinon on croit
 * qu'il reste 2404 à répartir alors qu'on en compte 2410, et l'écart part en
 * silence chez le marchand.
 *
 * > Auparavant cette fonction divisait par `(1 + commission)` — la commission
 * > était alors calculée sur la base (121 au lieu de 127 sur 2531), ce qui
 * > sous-évaluait ce que l'agrégateur prend réellement.
 */
function feeIncludedIn(ttcAmount, feePercent) {
  const ttc = toNumber(ttcAmount);
  const percent = toNumber(feePercent);
  if (ttc <= 0 || percent <= 0) return 0;
  return Math.max(0, Math.ceil((ttc * percent) / 100));
}

// Type de livraison (orders.delivery.type). Un même lieu existe dans les DEUX
// listes à des prix différents : l'express coûte plus cher. Confondre les deux
// crédite le fastfood du mauvais montant.
//
// Les deux listes n'ont PAS la même forme (migration 073) :
//   - PÉRIODIQUE : `deliveryHours[].periodicZones`, un prix par lieu ET par créneau ;
//   - EXPRESS    : `expressZones`, une liste par boutique, SANS heure — la course
//     part dès que la commande est prête. Un prix express par heure laissait
//     l'app et le backend lire deux prix différents pour un même lieu.

/** Zones périodiques, filtrées sur le créneau quand il est connu. */
function collectPeriodicZones(fastfood, hour) {
  const allHours = Array.isArray(fastfood?.deliveryHours) ? fastfood.deliveryHours : [];
  // Créneau donné : seulement ses zones. Un même lieu peut valoir 500 à 09:12
  // et 100 à 13:06 ; lire le premier trouvé versait le mauvais tarif.
  // Créneau absent de la boutique (supprimé depuis) : toutes les heures.
  const slot = hour ? allHours.filter(h => h && typeof h === 'object' && h.hour === hour) : [];
  const hours = slot.length ? slot : allHours;
  const zones = [];
  for (const h of hours) {
    // Le format legacy est un simple "HH:mm" : aucune zone à en tirer.
    if (!h || typeof h !== 'object') continue;
    if (Array.isArray(h.periodicZones)) zones.push(...h.periodicZones);
  }
  return zones;
}

/** Zones express de la boutique : l'heure n'y joue AUCUN rôle. */
function collectExpressZones(fastfood) {
  return Array.isArray(fastfood?.expressZones) ? fastfood.expressZones : [];
}

/**
 * Zones d'une boutique.
 * @param {string} [deliveryType] `express` | `time` — omis, les deux listes.
 * @param {string} [hour] créneau `HH:mm` — ne filtre que le PÉRIODIQUE.
 */
function collectZones(fastfood, deliveryType, hour) {
  let zones;
  if (deliveryType === 'express') zones = collectExpressZones(fastfood);
  else if (deliveryType === 'time') zones = collectPeriodicZones(fastfood, hour);
  else zones = [...collectPeriodicZones(fastfood, hour), ...collectExpressZones(fastfood)];
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
 * ⚠️ Et, en PÉRIODIQUE, par le CRÉNEAU (`hour` = `delivery.time`) : le prix
 * d'un lieu dépend de l'heure de départ. L'express n'a pas d'heure : un seul
 * prix par lieu (`expressZones`, migration 073).
 *
 * Zone introuvable : on retombe sur la plus chère du même type, jamais sur 0,
 * pour ne pas créditer la plateforme d'une marge qu'elle n'a pas gagnée.
 */
function zoneDeliveryPrice(fastfood, zoneName, deliveryType, hour) {
  if (!zoneName) return maxDeliveryPrice(fastfood, deliveryType);
  const zone = collectZones(fastfood, deliveryType, hour).find(z => z.lieu === zoneName);
  return zone ? toNumber(zone.prix) : maxDeliveryPrice(fastfood, deliveryType);
}

/**
 * Supplément intégré au prix d'un plat, avant frais : livraison + marge.
 *
 * @param {string} [deliveryType] restreint la recherche à une liste de zones.
 *   Omis (régime fastfood) : le maximum des DEUX listes, le user n'ayant pas
 *   encore choisi son mode. `'time'` (régime plateforme) : le PÉRIODIQUE seul —
 *   l'express y est un supplément assumé, pas la base du prix affiché.
 */
function displaySurcharge(fastfood, platformMargin, deliveryType) {
  return maxDeliveryPrice(fastfood, deliveryType) + toNumber(platformMargin);
}

/**
 * Marge due pour un prix BRUT donné, en régime FASTFOOD.
 *
 * Marge propre au régime (`fastfoodMargin`), DISTINCTE de `platformMargin` : les
 * deux régimes ne composent pas le prix de la même façon, leur marge n'a donc
 * aucune raison de bouger ensemble.
 *
 * Un plat cher supporte une marge plus élevée sans que le client la ressente en
 * proportion : le palier 2 REMPLACE la marge de base (il ne s'y ajoute pas) dès
 * que le brut atteint `fastfoodMarginTier2MinBrut`.
 *
 * Seuil ou marge du palier à 0 = aucun palier. `fastfoodMargin` à 0 (clé absente)
 * retombe sur `platformMargin`, pour qu'une migration non appliquée n'annule pas
 * toute marge.
 */
function marginForBrut(brut, pricing) {
  const base = toNumber(pricing?.fastfoodMargin) || toNumber(pricing?.platformMargin);
  const minBrut = toNumber(pricing?.fastfoodMarginTier2MinBrut);
  const tierMargin = toNumber(pricing?.fastfoodMarginTier2Margin);

  if (minBrut <= 0 || tierMargin <= 0) return base;
  return toNumber(brut) >= minBrut ? tierMargin : base;
}

// ── Qui livre la boutique (migration 037) ──────────────────────────────────
// 'fastfood' : régime historique — zone la plus chère, aucun arrondi.
// 'platform' : zones PLATEFORME, prix calé sur un multiple du pas d'arrondi,
//              la course du livreur absorbe la baisse (dans la limite fixée).
const DELIVERY_BY_FASTFOOD = 'fastfood';
const DELIVERY_BY_PLATFORM = 'platform';
/** Valeurs acceptées par `fastfoods.delivery_by` (contrainte SQL, migration 037). */
const DELIVERY_BY_VALUES = [DELIVERY_BY_FASTFOOD, DELIVERY_BY_PLATFORM];

/**
 * Liste de zones qui sert de BASE au prix affiché en régime plateforme.
 *
 * Le PÉRIODIQUE seul : un client qui choisit l'express paie son supplément en
 * connaissance de cause, alors que caler tout le catalogue sur l'express
 * gonflerait chaque prix pour un mode que la plupart ne prendront pas.
 *
 * ⚠️ Constante PARTAGÉE entre la composition (`applyDisplayPricing`) et la
 * répartition (`splitDeliveryAmounts`). Les deux doivent lire la MÊME liste :
 * quand la composition fondait le périodique (250) et que la répartition
 * facturait le max des deux listes (400, l'express), `charged_price` enregistrait
 * 150 F de plus que ce qui avait réellement été fondu — et la marge de
 * `order_deliveries` était gonflée d'autant.
 */
const PLATFORM_DISPLAY_ZONE_TYPE = 'time';

/** Vrai si la plateforme assure elle-même la livraison de cette boutique. */
function isPlatformDelivered(fastfood) {
  return fastfood?.deliveryBy === DELIVERY_BY_PLATFORM;
}

/**
 * Boutique vue par le moteur de prix quand la plateforme livre : ses zones sont
 * celles de la PLATEFORME, pas celles de la boutique.
 *
 * On réutilise `deliveryHours` / `expressZones` comme porteurs pour que
 * `collectZones`, `maxDeliveryPrice` et `zoneDeliveryPrice` fonctionnent sans le
 * savoir — la structure est identique : `platformDeliveryZones` (périodique,
 * par créneau) et `platformExpressZones` (express, sans heure, migration 073).
 */
function deliverySource(fastfood) {
  if (!isPlatformDelivered(fastfood)) return fastfood;
  return { ...fastfood, deliveryHours: fastfood?.platformDeliveryZones || [], expressZones: fastfood?.platformExpressZones || [] };
}

/**
 * Habille les zones EXPRESS de leurs frais, en régime plateforme.
 *
 * Le prix affiché du plat est calé sur la zone PÉRIODIQUE
 * (`PLATFORM_DISPLAY_ZONE_TYPE`) : celle-ci est fondue dedans, frais compris.
 * L'express, lui, était facturé BRUT — la commission et le retrait étaient donc
 * prélevés dessus sans avoir jamais été encaissés, et c'est le LIVREUR qui les
 * absorbait. Sur une zone périodique à 250 et un express à 400, il ne touchait
 * que 221 : 179 de manque, bien au-delà de `driverAmortizationMax`.
 *
 * L'express porte désormais ses frais comme un extra ou une boisson : `prix` est
 * ce que paie le client, `rawPrice` ce que touche le livreur. L'arrondi au pas
 * s'applique VERS LE HAUT (jamais de descente : rien ici n'a à être amorti), le
 * client ne voyant ainsi que des montants ronds.
 *
 * ⚠️ Le forfait de retrait est appliqué à la zone ISOLÉE alors qu'en réalité le
 * retrait porte une seule fois sur le total de la commande. On facture donc
 * jusqu'à 54 F pour un surcoût réel de 5 F au maximum (400 × 1,2 %). L'écart est
 * toujours en faveur de la plateforme, jamais l'inverse.
 *
 * ⚠️ Les zones PÉRIODIQUES restent brutes : déjà fondues dans le prix du plat,
 * les habiller les ferait payer deux fois.
 */
function expressDisplayPrice(brut, pricing) {
  const base = toNumber(brut);
  if (base <= 0) return 0;
  const priced = withAllFees(base, pricing);
  const step = toNumber(pricing?.expressPriceRoundingStep);
  // Jamais de descente : `amortizationMax` à 0 force l'arrondi supérieur.
  return step > 0 ? roundToStep(priced, { step, amortizationMax: 0 }) : priced;
}

/**
 * Prix AFFICHÉ de la zone express choisie — ce que le client a réellement payé
 * pour sa course, par opposition à `zoneDeliveryPrice` qui donne le brut versé
 * au livreur. L'écart entre les deux est la part de frais encaissée.
 */
function expressZoneDisplayPrice(fastfood, zoneName, pricing) {
  return expressDisplayPrice(zoneDeliveryPrice(fastfood, zoneName, 'express'), pricing);
}

/**
 * Habille une liste de zones EXPRESS (`platformExpressZones`, sans heure) de
 * ses frais : `prix` = ce que paie le client, `rawPrice` = brut du livreur.
 */
function applyExpressZonePricing(expressZones, pricing) {
  if (!Array.isArray(expressZones)) return expressZones;
  return expressZones.map(zone => {
    const brut = toNumber(zone?.prix);
    if (!zone || brut <= 0) return zone;
    return { ...zone, prix: expressDisplayPrice(brut, pricing), rawPrice: brut };
  });
}

/**
 * Prix RÉEL des frais de retrait pour un montant donné.
 * Résolu paresseusement : `withdrawalFees.js` importe `toNumber` d'ici, donc on
 * ne le require qu'à l'appel pour ne pas créer de cycle au chargement.
 */
function withdrawalFeeOn(amount, pricing) {
  if (!pricing?.withdrawalFees) return 0;
  const { withdrawalFee, OPERATORS } = require('./withdrawalFees');
  if (pricing.withdrawalOperator) return withdrawalFee(amount, pricing.withdrawalFees, pricing.withdrawalOperator);
  // Réseau inconnu (prix affiché) : barème de retrait le PLUS CHER des réseaux,
  // comme pour les frais de paiement. L'écart éventuel reste à la plateforme.
  return Math.max(...OPERATORS.map(op => withdrawalFee(amount, pricing.withdrawalFees, op)));
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
 *
 * La « commission » est le barème de l'agrégateur actif (`paymentFees.js`).
 * DigiKUNTZ : formule ci-dessus, inchangée. pawaPay : plus petit P tel que
 * P − ⌈dépôt × P⌉ − ⌈commission MW × P⌉ − ⌈réserve × P⌉ ≥ base + retrait.
 */
function withAllFees(amount, pricing) {
  const base = toNumber(amount);
  if (base <= 0) return 0;

  const withdrawal = withdrawalFeeOn(base, pricing);
  return grossUpForPaymentFees(base + withdrawal, pricing);
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
function applyDisplayPricingToMenu(menu, { surcharge, pricing, rounding, marginByBrut = false }) {
  if (!menu) return menu;
  const out = { ...menu };

  // Prix TOUS frais inclus : commission agrégateur ET frais de retrait. Le pas
  // d'arrondi est appliqué en dernier quand `rounding` est fourni — voir
  // `roundToStep`.
  const display = amount => {
    const priced = withAllFees(amount, pricing);
    return rounding ? roundToStep(priced, rounding) : priced;
  };

  // Régime FASTFOOD : le supplément ne porte QUE la marge, calculée d'après le
  // prix brut du plat (palier). La zone n'y entre pas — la course est facturée
  // à part, au tarif réel, et l'arrondi au pas la couvre.
  // Régime PLATEFORME : `surcharge` est figé (zone périodique + marge de base).
  const surchargeFor = brut => (marginByBrut ? marginForBrut(brut, pricing) : surcharge);

  // `rawPrice` = le prix RÉEL du fastfood, transporté à côté du prix affiché.
  // Le front le renvoie tel quel dans la commande, ce qui fige le prix de
  // l'époque : le prix affiché n'est PAS inversible (arrondis successifs) et
  // relire le menu plus tard donnerait le prix courant, pas celui payé.
  if (Array.isArray(menu[MENU_PRICES_FIELD])) {
    out[MENU_PRICES_FIELD] = menu[MENU_PRICES_FIELD].map(p => {
      const brut = toNumber(p?.price);
      return { ...p, price: display(brut + surchargeFor(brut)), rawPrice: brut };
    });
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
  // Taux effectif de l'agrégateur actif (réseau le plus cher), à titre informatif.
  const feePercent = paymentFeePercentOf(pricing);

  // Livraison PLATEFORME : les zones facturées sont celles de la plateforme.
  const platformDelivered = isPlatformDelivered(fastfood);
  const source = deliverySource(fastfood);
  // Régime PLATEFORME : le prix affiché se base sur le tarif PÉRIODIQUE. Un
  // client qui choisit l'express paie le supplément en connaissance de cause —
  // caler l'affichage sur l'express gonflerait le prix de tout le catalogue
  // pour un mode que la plupart ne prendront pas.
  // Régime PLATEFORME : la zone périodique est fondue dans le prix, marge de
  // base incluse — supplément unique pour tout le catalogue.
  //
  // Régime FASTFOOD : la zone n'entre PLUS dans le prix du plat. Y fondre la
  // zone la plus chère gonflait tous les prix pour couvrir un cas rare ; la
  // course est désormais facturée à part, au tarif réel, et c'est l'arrondi au
  // pas qui la couvre (le surplus absorbe sa commission). Le supplément se
  // réduit donc à la MARGE, calculée par palier sur le prix brut de chaque plat
  // — d'où `marginByBrut`, qui la fait varier d'une ligne à l'autre.
  const surcharge = platformDelivered ? displaySurcharge(source, platformMargin, PLATFORM_DISPLAY_ZONE_TYPE) : 0;

  // Le pas d'arrondi vaut désormais dans les DEUX régimes. En plateforme, la
  // course du livreur absorbe la baisse ; en fastfood, on ne descend jamais
  // (aucune course plateforme à amortir) et le surplus couvre la commission
  // prise sur la course facturée à part.
  const rounding = {
    step: toNumber(pricing?.priceRoundingStep),
    amortizationMax: platformDelivered ? toNumber(pricing?.driverAmortizationMax) : 0,
  };

  // Renvoyé dans les deux cas : le marchand voit ainsi ce que voit le client,
  // et le front n'a rien à recalculer.
  const meta = {
    surcharge,
    maxDeliveryPrice: maxDeliveryPrice(source, platformDelivered ? PLATFORM_DISPLAY_ZONE_TYPE : undefined),
    platformMargin,
    paymentFeePercent: feePercent,
    deliveryBy: platformDelivered ? DELIVERY_BY_PLATFORM : 'fastfood',
    priceRoundingStep: rounding.step,
    driverAmortizationMax: rounding.amortizationMax,
    // Régime fastfood : la marge n'est plus une constante, le front ne peut pas
    // la déduire du seul `platformMargin`. On expose donc le palier.
    ...(platformDelivered ? {} : { fastfoodMarginTier2MinBrut: toNumber(pricing?.fastfoodMarginTier2MinBrut), fastfoodMarginTier2Margin: toNumber(pricing?.fastfoodMarginTier2Margin) }),
    applied: !raw,
  };

  if (raw) return { ...fastfood, pricing: meta };

  const opts = { surcharge, pricing, rounding, marginByBrut: !platformDelivered };
  const menus = Array.isArray(fastfood.menus) ? fastfood.menus.map(m => applyDisplayPricingToMenu(m, opts)) : fastfood.menus;

  // Régime PLATEFORME uniquement : les zones express portent leurs frais. En
  // régime fastfood, la course est facturée au tarif réel et ses frais sont déjà
  // couverts par le surplus d'arrondi du plat (`fastfood_min_covered_course`).
  const out = { ...fastfood, menus, pricing: meta };
  if (platformDelivered) {
    out.platformExpressZones = applyExpressZonePricing(fastfood.platformExpressZones, pricing);
  }
  return out;
}

module.exports = {
  MENU_PRICES_FIELD,
  DELIVERY_BY_PLATFORM,
  DELIVERY_BY_VALUES,
  isPlatformDelivered,
  PLATFORM_DISPLAY_ZONE_TYPE,
  deliverySource,
  withAllFees,
  roundToStep,
  toNumber,
  feeIncludedIn,
  collectZones,
  maxDeliveryPrice,
  zoneDeliveryPrice,
  displaySurcharge,
  applyExpressZonePricing,
  marginForBrut,
  applyDisplayPricingToMenu,
  applyDisplayPricing,
  expressZoneDisplayPrice,
};
