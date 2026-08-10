// ============================================================================
// deliveryOfferAffordability — une livraison offerte doit rester finançable
// ============================================================================
// Offrir la livraison ne coûtait rien tant que la zone la PLUS CHÈRE était
// fondue dans le prix du plat : la marge (zone + 100) couvrait n'importe quelle
// course. Depuis la migration 038, le régime `fastfood` ne fond plus aucune zone
// et la marge vaut 200 — au-delà d'environ 320 F de course offerte, la
// plateforme verse au marchand PLUS qu'elle n'a encaissé.
//
// Ce qui finance une course offerte, par plat commandé :
//
//   marge (200 ou 300 selon le palier)
//   + surplus d'arrondi (l'écart entre le prix juste et le multiple de 500)
//   − la commission de l'agrégateur, qui porte sur tout ce qui est encaissé
//
// Comme marge et surplus sont facturés sur CHAQUE exemplaire alors que la course
// reste unique, commander plus de plats rend l'offre finançable. D'où la règle :
// un nombre minimum de plats, calculé pour que la marge ne devienne jamais
// négative.
//
// ⚠️ Ne concerne QUE les bonus `coveredBy = 'platform'`. Sur un bonus de
// boutique, c'est le marchand qui renonce à sa course : la plateforme ne finance
// rien et aucun minimum n'a lieu d'être.
//
// ⚠️ Ne concerne QUE le régime `fastfood`. En régime `platform`, aucun minimum
// n'a lieu d'être — non par analogie avec l'ancien modèle, mais parce que le
// fondu SURCOUVRE la course. Voir `architecture/pricing-platform-delivery.md`
// pour le détail chiffré ; en résumé, zone 250 et marge 100 fondues par plat :
//
//   1 plat  → le livreur absorbe au pire 100, borne exacte de
//             `driverAmortizationMax` — jamais franchie, par construction
//   2 plats → absorption 0, il touche sa course entière
//
// Le fondu est facturé sur CHAQUE plat quand la course reste unique : dès le
// deuxième exemplaire, un fondu entier n'a plus aucune course en face.
// ============================================================================
const { toNumber, withAllFees, roundToStep, marginForBrut, isPlatformDelivered } = require('../pricing/deliveryPricing');

/**
 * Plats minimum pour une gratuité en régime PLATEFORME, selon le motif.
 *
 * À un seul plat, le livreur absorbe une partie de sa course (l'arrondi vers le
 * bas, borné par `driver_amortization_max`). À deux, un fondu entier n'a plus
 * de course en face : il touche son tarif ENTIER. C'est une protection du
 * LIVREUR — la marge, elle, n'est jamais menacée dans ce régime.
 *
 * Deux réglages DISTINCTS (migration 041) : une campagne globale s'adresse à
 * tout le monde, un bonus récompense un client précis. On peut vouloir durcir
 * l'une sans toucher à l'autre.
 *
 * @param {Object} pricing
 * @param {string} reason `campaign` | `bonus`
 */
function platformMinItems(pricing, reason) {
  const key = reason === 'campaign' ? 'platformFreeDeliveryMinItemsCampaign' : 'platformFreeDeliveryMinItemsBonus';
  return Math.max(1, toNumber(pricing?.[key]) || 1);
}

/**
 * Ce qu'UN exemplaire du plat laisse à la plateforme, net de commission.
 *
 * C'est la marge du palier plus le surplus d'arrondi, amputés de la commission
 * que l'agrégateur prélève dessus. Le frais de retrait n'entre pas ici : il est
 * déjà couvert par le prix juste, avant l'arrondi.
 */
function contributionPerItem(brutUnit, pricing) {
  const brut = toNumber(brutUnit);
  if (brut <= 0) return 0;

  const margin = marginForBrut(brut, pricing);
  const juste = withAllFees(brut + margin, pricing);
  const step = toNumber(pricing?.priceRoundingStep);
  // Régime fastfood : on ne descend jamais (aucune course à amortir).
  const displayed = step > 0 ? roundToStep(juste, { step, amortizationMax: 0 }) : juste;

  const surplus = displayed - juste;
  const percent = toNumber(pricing?.paymentFeePercent);
  const gross = margin + surplus;

  // La commission porte sur ce qui est encaissé, donc aussi sur cette part.
  return gross * (1 - percent / 100);
}

/**
 * Nombre minimum de plats pour qu'une course offerte reste finançable.
 *
 * La course est versée au fastfood sans avoir été encaissée : il faut que la
 * contribution cumulée des plats la couvre, commission incluse — la course
 * facturée à personne subit tout de même la commission sur le reste du panier.
 *
 * @returns {number} 1 quand un seul plat suffit ; 0 si le calcul n'a pas de sens
 *   (course nulle, réglages illisibles) — aucun minimum n'est alors imposé.
 */
function minItemsForFreeDelivery(brutUnit, coursePrice, pricing) {
  const course = toNumber(coursePrice);
  if (course <= 0) return 0;

  const perItem = contributionPerItem(brutUnit, pricing);
  // Contribution nulle ou négative : aucune quantité ne rendrait l'offre
  // finançable. On ne renvoie pas l'infini — c'est au appelant de refuser.
  if (perItem <= 0) return Infinity;

  return Math.ceil(course / perItem);
}

/**
 * La livraison offerte est-elle finançable pour cette commande ?
 *
 * @param {Object} params
 * @param {Object} params.fastfood   boutique (pour connaître son régime)
 * @param {number} params.brutUnit   prix BRUT unitaire du plat (`rawPrice`)
 * @param {number} params.quantity   nombre d'exemplaires commandés
 * @param {number} params.coursePrice tarif réel de la zone choisie
 * @param {string} params.coveredBy  `platform` | `fastfood`
 * @param {string} [params.reason]   `campaign` | `bonus` — décide du réglage lu
 *   en régime plateforme, les deux motifs ayant leur propre seuil.
 * @param {Object} params.pricing    réglages tarifaires
 * @returns {{affordable:boolean, minItems:number, missing:number, fixed?:boolean}}
 */
function checkFreeDeliveryAffordable({ fastfood, brutUnit, quantity, coursePrice, coveredBy, reason = 'bonus', pricing }) {
  const qty = Math.max(1, toNumber(quantity) || 1);

  // Bonus de boutique : le marchand renonce à sa course, la plateforme ne
  // finance rien à sa place — aucun minimum n'a de sens.
  if (coveredBy !== 'platform') {
    return { affordable: true, minItems: 0, missing: 0 };
  }

  // Régime PLATEFORME : minimum FIXE, piloté en base. La marge n'est jamais en
  // danger ici (le fondu surcouvre la course), mais à un seul plat le livreur
  // absorbe une partie de sa course — jusqu'à `driver_amortization_max`. Dès
  // deux plats, un fondu entier n'a plus de course en face et il touche son
  // tarif ENTIER. Le minimum protège donc le livreur, pas la marge.
  //
  // Fixe et non calculé : l'absorption dépend de la position du prix juste dans
  // le pas d'arrondi, donc du plat. Un seuil qui varierait d'un plat à l'autre
  // serait inexplicable au user.
  if (isPlatformDelivered(fastfood)) {
    const minItems = platformMinItems(pricing, reason);
    const affordable = qty >= minItems;
    return { affordable, minItems, missing: affordable ? 0 : minItems - qty, fixed: true };
  }

  const minItems = minItemsForFreeDelivery(brutUnit, coursePrice, pricing);
  if (minItems === 0) return { affordable: true, minItems: 0, missing: 0 };

  const affordable = Number.isFinite(minItems) && qty >= minItems;
  return { affordable, minItems, missing: affordable ? 0 : Math.max(0, minItems - qty) };
}

/**
 * Message affiché tel quel par le front quand l'offre n'est pas finançable.
 *
 * `fixed` distingue les deux régimes : en plateforme le minimum est le même
 * partout, alors qu'en fastfood il dépend de la zone et du prix du plat. Dire
 * « pour cette zone » là où le seuil est constant induirait le user en erreur.
 */
function affordabilityMessage({ minItems, missing, fixed = false }) {
  if (!Number.isFinite(minItems)) {
    return "La livraison offerte n'est pas applicable sur cette commande.";
  }
  const plats = minItems > 1 ? 'plats' : 'plat';
  const portee = fixed ? `${minItems} ${plats} minimum` : `${minItems} ${plats} minimum pour cette zone`;
  return `Ajoutez ${missing} ${missing > 1 ? 'plats' : 'plat'} pour bénéficier de la livraison offerte (${portee}).`;
}

module.exports = {
  platformMinItems,
  contributionPerItem,
  minItemsForFreeDelivery,
  checkFreeDeliveryAffordable,
  affordabilityMessage,
};
