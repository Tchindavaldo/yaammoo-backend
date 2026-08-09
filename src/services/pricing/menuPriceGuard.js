// ============================================================================
// menuPriceGuard — un prix de menu doit financer sa propre livraison
// ============================================================================
// Le prix affiché est calé sur un multiple de `price_rounding_step` (500), vers
// le haut. L'écart entre le prix juste et ce multiple — le SURPLUS — est ce qui
// finance la course quand la livraison est offerte, et ce qui absorbe la
// commission prélevée sur la course facturée à part.
//
// Or le surplus ne dépend PAS de la hauteur du prix : il dépend de la position
// du prix juste dans le pas. Un prix juste qui tombe à 1 F sous un palier laisse
// un surplus de 1 F, qu'il s'agisse d'un plat à 660 ou à 9 900.
//
//   brut  640 → juste  942 → affiché 1000 → surplus 58  → couvre 1160  ✅
//   brut  660 → juste  963 → affiché 1000 → surplus 37  → couvre  740  ❌
//   brut  700 → juste 1005 → affiché 1500 → surplus 495 → couvre 9900  ✅
//
// D'où ce garde-fou : on refuse un prix dont le surplus ne couvrirait pas
// `fastfood_min_covered_course` (1400 F) de course. Les refus forment des
// bandes étroites (~70 F) juste sous chaque palier, soit ~14 % des prix — le
// message suggère donc toujours les deux prix valides voisins.
//
// ⚠️ Un PLAFOND fixe ne protégerait de rien : il laisserait passer 8990
// (surplus 98) et bloquerait 9100 (surplus 482). C'est bien le surplus qu'on
// teste, pas la hauteur.
//
// ⚠️ Régime FASTFOOD uniquement. En régime plateforme, la zone périodique est
// fondue dans le prix : elle finance déjà la course, et l'arrondi peut DESCENDRE
// (la course du livreur l'absorbe) — le surplus n'y joue pas le même rôle.
// ============================================================================
const { toNumber, withAllFees, roundToStep, marginForBrut, isPlatformDelivered } = require('./deliveryPricing');

/**
 * Part variable du frais de retrait, en pourcentage. Au-delà du seuil, le barème
 * est `percent % + addend` : c'est ce `percent` qui grossit avec la course.
 * Les deux opérateurs portent la même valeur aujourd'hui ; on prend le maximum
 * pour ne jamais sous-estimer ce qu'il faudra absorber.
 */
function withdrawalPercentOf(pricing) {
  const fees = pricing?.withdrawalFees;
  if (!fees) return 0;
  return Object.values(fees).reduce((max, f) => Math.max(max, toNumber(f?.percent)), 0);
}

/** Pas de recherche du prix valide le plus proche (FCFA). */
const SUGGEST_STEP = 10;
/** Bornes de la recherche, pour ne jamais boucler indéfiniment. */
const SUGGEST_SPAN = 1000;

/**
 * Ce qu'un prix brut laisse comme surplus d'arrondi, et la course que ce
 * surplus permet de couvrir.
 *
 * @returns {{margin:number, juste:number, displayed:number, surplus:number, covered:number}}
 */
function surplusOf(brut, pricing) {
  const price = toNumber(brut);
  const margin = marginForBrut(price, pricing);
  const juste = withAllFees(price + margin, pricing);

  const step = toNumber(pricing?.priceRoundingStep);
  // Régime fastfood : on ne descend jamais, aucune course plateforme à amortir.
  const displayed = step > 0 ? roundToStep(juste, { step, amortizationMax: 0 }) : juste;
  const surplus = displayed - juste;

  // ⚠️ Le diviseur est commission + RETRAIT, pas la commission seule. Une course
  // facturée fait monter les deux : la commission porte sur le total encaissé,
  // et le frais de retrait aussi. Diviser par les 5 % seuls sous-estimait la
  // couverture et laissait la marge être entamée (cf. pricing-margin-risk.md).
  const percent = toNumber(pricing?.paymentFeePercent) + withdrawalPercentOf(pricing);
  const covered = percent > 0 ? Math.floor(surplus / (percent / 100)) : Infinity;

  return { margin, juste, displayed, surplus, covered };
}

/** Le prix couvre-t-il l'exigence ? */
function isPriceAcceptable(brut, pricing) {
  const required = toNumber(pricing?.fastfoodMinCoveredCourse);
  if (required <= 0) return true; // aucune exigence configurée
  if (toNumber(brut) <= 0) return true; // prix nul : c'est au validateur de forme de trancher
  return surplusOf(brut, pricing).covered >= required;
}

/**
 * Prix valides les plus proches, de part et d'autre. `null` si aucun n'est
 * trouvé dans la fenêtre de recherche.
 */
function nearestAcceptable(brut, pricing) {
  const price = toNumber(brut);
  let below = null;
  let above = null;

  for (let b = price - SUGGEST_STEP; b >= Math.max(1, price - SUGGEST_SPAN); b -= SUGGEST_STEP) {
    if (isPriceAcceptable(b, pricing)) {
      below = b;
      break;
    }
  }
  for (let b = price + SUGGEST_STEP; b <= price + SUGGEST_SPAN; b += SUGGEST_STEP) {
    if (isPriceAcceptable(b, pricing)) {
      above = b;
      break;
    }
  }
  return { below, above };
}

/**
 * Vérifie tous les prix d'un menu (`prices[].price`).
 *
 * Extras et boissons ne sont PAS contrôlés : ils ne portent ni marge, ni
 * arrondi — donc aucun surplus à exiger d'eux.
 *
 * @param {Object} menu     données du menu (au moins `prices[]`)
 * @param {Object} fastfood boutique — le contrôle est sauté en régime plateforme
 * @param {Object} pricing  réglages tarifaires
 * @returns {Array<{field:string, message:string}>} erreurs, vide si tout passe
 */
function validateMenuPrices(menu, fastfood, pricing) {
  const required = toNumber(pricing?.fastfoodMinCoveredCourse);
  if (required <= 0) return [];
  if (isPlatformDelivered(fastfood)) return [];

  const prices = menu?.prices;
  if (!Array.isArray(prices)) return [];

  const errors = [];
  prices.forEach((entry, index) => {
    const brut = toNumber(entry?.price);
    if (brut <= 0) return; // laissé au validateur de forme

    const { covered } = surplusOf(brut, pricing);
    if (covered >= required) return;

    const { below, above } = nearestAcceptable(brut, pricing);
    const alts = [below, above].filter(v => v != null);
    const suggestion = alts.length ? ` Prix proches valides : ${alts.join(' ou ')}.` : '';

    errors.push({
      field: `prices[${index}].price`,
      message: `Le prix ${brut} ne permet pas de couvrir les frais de livraison ` + `(${covered} F couverts au lieu de ${required}).${suggestion}`,
    });
  });

  return errors;
}

/**
 * Vérifie les prix de ZONE d'une liste de créneaux (`deliveryHours`).
 *
 * Le pendant du contrôle sur les menus, à l'autre bout : un menu valide a un
 * surplus qui couvre AU MOINS `fastfood_min_covered_course`, donc une zone qui
 * ne dépasse pas cette même valeur est TOUJOURS absorbée par le surplus, quel
 * que soit le plat commandé. La marge n'est alors jamais entamée.
 *
 * Sans ce plafond, une zone à 5000 sur un plat brut à 2000 (surplus 127, qui ne
 * couvre que 2540) faisait tomber la marge de 308 à 35 : la commission prélevée
 * sur la course sortait de la marge, faute de surplus pour l'absorber.
 *
 * @param {Array}  deliveryHours créneaux avec `periodicZones` / `expressZones`
 * @param {Object} pricing       réglages tarifaires
 * @returns {Array<{field:string, message:string}>} erreurs, vide si tout passe
 */
function validateDeliveryZones(deliveryHours, pricing) {
  const max = toNumber(pricing?.fastfoodMinCoveredCourse);
  if (max <= 0) return [];
  if (!Array.isArray(deliveryHours)) return [];

  const errors = [];
  deliveryHours.forEach((slot, slotIndex) => {
    for (const field of ['periodicZones', 'expressZones']) {
      const zones = slot?.[field];
      if (!Array.isArray(zones)) continue;

      zones.forEach((zone, zoneIndex) => {
        const prix = toNumber(zone?.prix);
        if (prix <= max) return;

        errors.push({
          field: `deliveryHours[${slotIndex}].${field}[${zoneIndex}].prix`,
          message: `La zone « ${zone?.lieu ?? '?'} » à ${prix} F dépasse le maximum autorisé ` + `(${max} F). Au-delà, les frais prélevés sur la course ne sont plus couverts.`,
        });
      });
    }
  });

  return errors;
}

module.exports = {
  surplusOf,
  isPriceAcceptable,
  nearestAcceptable,
  validateMenuPrices,
  validateDeliveryZones,
};
