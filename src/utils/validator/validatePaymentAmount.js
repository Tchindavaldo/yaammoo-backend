// ============================================================================
// validatePaymentAmount — Cohérence du montant à encaisser
// ----------------------------------------------------------------------------
// `amount` (racine) et `items[].total` sont TOUS fournis par le client : on ne
// leur fait pas confiance. Le backend RECALCULE tout, en trois temps :
//
//   1. NIVEAU ITEM — pour chaque commande, `total` reçu doit égaler le total
//      recalculé depuis les prix du menu. Au premier écart → REFUS (400), sans
//      traiter les items suivants ni sommer.
//   2. DÉDUCTION LIVRAISON GROUPÉE — la livraison est fondue dans le prix de
//      CHAQUE plat. Or plusieurs commandes livrées ensemble (même boutique, même
//      zone, même créneau) ne font qu'UNE course : le user ne doit payer qu'une
//      seule livraison, pas une par commande. On déduit donc les livraisons en
//      double (cf. § Groupes ci-dessous).
//   3. NIVEAU PANIER — `amount` doit égaler (Σ totaux − livraisons en double).
//
// Composition d'un total (cf. architecture/orders.md) :
//   total = (prix_plat × quantity)                       // plat seul × quantité
//         + Σ(extra.prix   où status === true)            // extra coché : ×1
//         + Σ(drink.prix × drink.quantite  où status)     // drink coché : × sa quantite
//
// § Groupes de livraison (une seule course facturée par groupe) :
//   • express → clé (fastFoodId + zone)
//   • time    → clé (fastFoodId + zone + heure)
//   Un groupe de N commandes livrées ⇒ on déduit (N−1) × delivery.prix.
//   `delivery.prix` est pris tel quel du payload (montant que le front a affiché).
//   Les commandes en retrait (delivery.status !== true) ne portent aucune course.
//
// ⚠️ `selectedPriceIndex` est en base 1 : le prix choisi = prices[selectedPriceIndex-1].
// ⚠️ Ne s'applique qu'au paiement PLEIN. Un paiement partiel (`mobileApp` avec
// `amount < currentAmount`) encaisse volontairement moins : l'appelant l'exclut.
// ============================================================================

const { toNumber } = require('../../services/pricing/deliveryPricing');

// Tolérance d'arrondi (FCFA) : prix entiers, 1 unité de marge pour un éventuel
// arrondi de sommation côté client.
const AMOUNT_TOLERANCE = 1;

/** Somme des `prix` des éléments cochés (status === true), chacun × un facteur. */
function sumChecked(list, factorOf) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, it) => {
    if (it?.status !== true) return sum;
    return sum + toNumber(it?.prix) * factorOf(it);
  }, 0);
}

/** Recompose le total d'une commande depuis les prix du menu (jamais le front). */
function recomputeItemTotal(item) {
  const prices = item?.menu?.prices;
  // selectedPriceIndex est en base 1 → prices[index - 1].
  const idx = Math.max(0, toNumber(item?.selectedPriceIndex) - 1);
  const unitPlat = Array.isArray(prices) ? toNumber(prices[idx]?.price) : 0;
  const qty = Math.max(1, toNumber(item?.quantity) || 1);

  const plat = unitPlat * qty;
  const extras = sumChecked(item?.extra, () => 1); // extra coché : ×1
  const drinks = sumChecked(item?.drink, d => Math.max(1, toNumber(d?.quantite) || 1)); // × sa quantite

  return { total: plat + extras + drinks, plat, extras, drinks, unitPlat, qty };
}

/** Clé de regroupement des livraisons — une seule course par groupe. */
function deliveryGroupKey(item) {
  const d = item?.delivery;
  if (!d || d.status !== true) return null; // retrait : aucune course
  const zone = String(d.zone ?? '')
    .trim()
    .toLowerCase();
  const type = String(d.type ?? '')
    .trim()
    .toLowerCase();
  // express : boutique + zone ; time : boutique + zone + heure.
  if (type === 'time') return `${item.fastFoodId}|${zone}|${String(d.time ?? '').trim()}`;
  return `${item.fastFoodId}|${zone}`;
}

/**
 * Livraisons facturées en double : par groupe de N commandes livrées, seule 1
 * course est due → on déduit (N−1) × delivery.prix.
 * @returns {number} montant total à déduire des totaux
 */
function duplicateDeliveryDeduction(orders) {
  const groups = {};
  for (const item of orders) {
    const key = deliveryGroupKey(item);
    if (!key) continue;
    (groups[key] ||= []).push(item);
  }

  let deduction = 0;
  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    // Prix de livraison du groupe (identique en principe ; on prend le 1er).
    const unitPrix = Math.max(0, toNumber(group[0]?.delivery?.prix));
    const dupCount = group.length - 1;
    const sub = dupCount * unitPrix;
    deduction += sub;
    console.log(`[payAmount]   ⤷ groupe livraison [${key}] : ${group.length} cmd → 1 seule course, déduit ${dupCount}×${unitPrix}=${sub}`);
  }
  return deduction;
}

/**
 * @param {number} amount montant que le client veut faire encaisser (racine)
 * @param {Array}  items  commandes du panier
 * @returns {string|null} message d'erreur, ou null si cohérent
 */
function validatePaymentAmount(amount, items) {
  const orders = Array.isArray(items) ? items : items ? [items] : [];
  if (orders.length === 0) return null;

  const paid = toNumber(amount);
  console.log(`[payAmount] ── ${orders.length} commande(s), amount reçu=${paid}`);

  let sumTotal = 0;

  // NIVEAU ITEM : recalcul + comparaison, stop au premier écart.
  for (let i = 0; i < orders.length; i++) {
    const item = orders[i];
    const totalRecu = toNumber(item?.total);
    const r = recomputeItemTotal(item);

    console.log(`[payAmount]   #${i + 1} plat=${r.unitPlat}×${r.qty}=${r.plat} + extras=${r.extras} + drinks=${r.drinks} ` + `→ recalculé=${r.total} | reçu=${totalRecu}`);

    if (Math.abs(totalRecu - r.total) > AMOUNT_TOLERANCE) {
      console.log(`[payAmount] ✗ commande #${i + 1} : total reçu ${totalRecu} ≠ recalculé ${r.total} → REFUS`);
      return `Total incohérent sur la commande #${i + 1} : ${totalRecu} FCFA reçus, ` + `${r.total} FCFA attendus (plat ${r.plat} + extras ${r.extras} + boissons ${r.drinks}).`;
    }

    sumTotal += r.total;
  }

  // DÉDUCTION des livraisons facturées en double dans un même groupe.
  const deduction = duplicateDeliveryDeduction(orders);
  const expected = sumTotal - deduction;

  // NIVEAU PANIER : amount == Σtotaux − livraisons en double.
  console.log(`[payAmount] Σtotal=${sumTotal} − livraisons en double=${deduction} → attendu=${expected} | amount=${paid}`);
  if (Math.abs(paid - expected) > AMOUNT_TOLERANCE) {
    console.log(`[payAmount] ✗ amount ${paid} ≠ attendu ${expected} → REFUS`);
    return `Montant incohérent : ${paid} FCFA demandés, ${expected} FCFA attendus ` + `(total ${sumTotal} − ${deduction} de livraisons déjà comptées une fois).`;
  }

  console.log(`[payAmount] ✓ amount ${paid} == attendu ${expected} → OK`);
  return null;
}

module.exports = {
  validatePaymentAmount,
  recomputeItemTotal,
  duplicateDeliveryDeduction,
  deliveryGroupKey,
  AMOUNT_TOLERANCE,
};
