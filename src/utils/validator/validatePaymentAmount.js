// ============================================================================
// validatePaymentAmount — Cohérence du montant à encaisser
// ----------------------------------------------------------------------------
// `amount` (racine) et `items[].total` sont TOUS fournis par le client : on ne
// leur fait pas confiance. Le backend RECALCULE chaque total, en tenant compte
// de la LIVRAISON, puis vérifie amount == Σ(totaux recalculés).
//
// Composition d'un total (cf. architecture/payment-amount-check.md) :
//   base = (prix_plat × quantity)                       // plat × quantité
//        + Σ(extra.prix   où status === true)            // extra coché : ×1
//        + Σ(drink.prix × drink.quantite  où status)     // drink coché : × sa quantite
//
//   • livraison NON offerte → total = base + delivery.prix   (le user paie la course)
//   • livraison OFFERTE     → total = base                   (course offerte)
//
// « Offerte » = verdict SERVEUR (resolveDeliveryBonus / mode campagne), jamais la
// simple présence de `bonusCode`. Un bonus vaut une fois par lot ; une campagne
// couvre toutes les boutiques.
//
// PANIER GROUPÉ : plusieurs commandes livrées ensemble (même boutique, même zone,
// même créneau) ne font qu'UNE course. Chaque total non offert porte pourtant son
// `delivery.prix` → on déduit (N−1) × delivery.prix par groupe. Une commande dont
// la livraison est offerte n'entre pas dans un groupe facturé (elle n'a pas payé
// de course).
//
// ⚠️ `selectedPriceIndex` est en base 1 : prix choisi = prices[selectedPriceIndex-1].
// ⚠️ Ne s'applique qu'au paiement PLEIN (l'appelant exclut le partiel).
// ============================================================================

const { toNumber } = require('../../services/pricing/deliveryPricing');
const { getPricingSettings } = require('../../services/settings/settings.service');
const { resolveDeliveryBonus } = require('../../services/bonus/applyDeliveryBonus.service');
const { resolveOffer } = require('../../services/pricing/deliveryOfferResolver');
// Clé PARTAGÉE avec `settleDelivery` : ce qui est facturé et ce qui est versé
// doivent compter exactement le même nombre de courses.
const { deliveryGroupKey } = require('../../services/pricing/deliveryGroupKey');
const { checkFreeDeliveryAffordable, affordabilityMessage } = require('../../services/bonus/deliveryOfferAffordability');
const repos = require('../../repositories');

/** Prix BRUT unitaire du plat choisi — la base du palier de marge. */
function rawUnitPriceOf(item) {
  const prices = item?.menu?.prices;
  const idx = Math.max(0, toNumber(item?.selectedPriceIndex) - 1);
  return Array.isArray(prices) ? toNumber(prices[idx]?.rawPrice ?? prices[idx]?.price) : 0;
}

// Tolérance d'arrondi (FCFA).
const AMOUNT_TOLERANCE = 1;

/** Somme des `prix` des éléments cochés (status === true), chacun × un facteur. */
function sumChecked(list, factorOf) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, it) => {
    if (it?.status !== true) return sum;
    return sum + toNumber(it?.prix) * factorOf(it);
  }, 0);
}

/** Base d'un total (hors livraison) : plat × quantité + extras + drinks cochés. */
function recomputeItemBase(item) {
  const prices = item?.menu?.prices;
  const idx = Math.max(0, toNumber(item?.selectedPriceIndex) - 1);
  const unitPlat = Array.isArray(prices) ? toNumber(prices[idx]?.price) : 0;
  const qty = Math.max(1, toNumber(item?.quantity) || 1);

  const plat = unitPlat * qty;
  const extras = sumChecked(item?.extra, () => 1);
  const drinks = sumChecked(item?.drink, d => Math.max(1, toNumber(d?.quantite) || 1));

  return { base: plat + extras + drinks, plat, extras, drinks, unitPlat, qty };
}

/**
 * Détermine, commande par commande, si la livraison est offerte côté SERVEUR.
 *
 * @returns {Promise<{offered:Set<number>, refusal:string|null}>}
 *   `refusal` : message d'erreur quand un bonus PLATEFORME n'est pas finançable
 *   par la commande (cf. `deliveryOfferAffordability`). Refus DUR : mieux vaut
 *   une commande sans gratuité qu'une commande à perte.
 */
async function resolveOfferedDeliveries(orders, { userId, bonusCode }) {
  const pricing = await getPricingSettings();
  const campaignOffer = resolveOffer(pricing.deliveryFreeMode, null).offer;

  const offered = new Set();
  let bonusSpent = false;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (order?.delivery?.status !== true) continue; // retrait : pas de livraison

    if (campaignOffer) {
      offered.add(i);
      continue;
    }
    // Toujours interroger le pipeline (même sans `bonusCode`) : `resolveDeliveryBonus`
    // retombe sur l'ARMEMENT global du user (après réclamation, le user arme son
    // bonus au lieu de présenter un code). Un userId est requis pour l'armement.
    if (!bonusSpent && (bonusCode || userId)) {
      const attempt = await resolveDeliveryBonus({ userId, fastFoodId: order.fastFoodId, bonusCode }).catch(() => null);
      if (attempt?.offer) {
        // ── La gratuité doit rester FINANÇABLE ────────────────────────────
        // Un bonus plateforme fait verser la course au fastfood sans qu'elle
        // ait été encaissée. Marge + surplus d'arrondi sont facturés par
        // exemplaire, la course non : sous un certain nombre de plats, la
        // commande part à perte. On refuse plutôt que d'absorber.
        const fastfood = await repos.fastfoods.getById(order.fastFoodId).catch(() => null);
        const check = checkFreeDeliveryAffordable({
          fastfood,
          brutUnit: rawUnitPriceOf(order),
          quantity: order.quantity,
          coursePrice: toNumber(order.delivery?.prix),
          coveredBy: attempt.offer.coveredBy,
          pricing,
        });
        if (!check.affordable) {
          return { offered, refusal: affordabilityMessage(check) };
        }

        offered.add(i);
        bonusSpent = true; // un bonus vaut une fois pour le lot
      }
    }
  }
  return { offered, refusal: null };
}

/**
 * @param {number} amount  montant que le client veut faire encaisser (racine)
 * @param {Array}  items   commandes du panier
 * @param {Object} [ctx]   { userId, bonusCode }
 * @returns {Promise<string|null>} message d'erreur, ou null si cohérent
 */
async function validatePaymentAmount(amount, items, ctx = {}) {
  const orders = Array.isArray(items) ? items : items ? [items] : [];
  if (orders.length === 0) return null;

  const paid = toNumber(amount);
  const bonusCode = ctx.bonusCode || orders.find(o => o?.bonusCode)?.bonusCode || null;
  // Ligne vide + filet : le bloc doit se repérer d'un coup d'œil au milieu des
  // logs applicatifs (keep-alive, wallet, fastfood…) qui défilent en continu.
  console.log(`\n[payAmount] ═══ ${orders.length} commande(s) · amount reçu=${paid} · bonusCode=${bonusCode || '∅'} ═══`);

  // Verdict SERVEUR : quelles livraisons sont offertes. Un bonus plateforme non
  // finançable par la commande est REFUSÉ ici, avant tout encaissement.
  const { offered, refusal } = await resolveOfferedDeliveries(orders, { userId: ctx.userId, bonusCode });
  if (refusal) {
    console.log(`[payAmount] ✗ bonus livraison non finançable → REFUS\n`);
    return refusal;
  }

  let sumTotal = 0;

  // Lignes de log mises de côté puis affichées PAR GROUPE de livraison (plus bas) :
  // à plat, 25 commandes se lisaient comme un mur indifférencié, alors que ce qui
  // compte au diagnostic est justement « quelles commandes partagent une course ».
  // La validation, elle, reste dans l'ordre reçu et s'arrête au 1er écart.
  const logLines = [];

  // NIVEAU ITEM : recalcul (avec/sans livraison) + comparaison, stop au 1er écart.
  for (let i = 0; i < orders.length; i++) {
    const item = orders[i];
    const totalRecu = toNumber(item?.total);
    const r = recomputeItemBase(item);

    const delivered = item?.delivery?.status === true;
    const isOffered = offered.has(i);
    // Livraison ajoutée au total UNIQUEMENT si livrée ET non offerte.
    const deliv = delivered && !isOffered ? Math.max(0, toNumber(item?.delivery?.prix)) : 0;
    const attendu = r.base + deliv;

    logLines.push({
      key: deliveryGroupKey(item),
      text: `#${i + 1} plat=${r.unitPlat}×${r.qty}=${r.plat} + extras=${r.extras} + drinks=${r.drinks}` + ` + livraison=${deliv}${isOffered ? ' (OFFERTE)' : ''} → attendu=${attendu} | reçu=${totalRecu}`,
    });

    if (Math.abs(totalRecu - attendu) > AMOUNT_TOLERANCE) {
      logLines.forEach(l => console.log(`[payAmount]   ${l.text}`));
      console.log(`[payAmount] ✗ commande #${i + 1} : total reçu ${totalRecu} ≠ attendu ${attendu} → REFUS\n`);
      return `Total incohérent sur la commande #${i + 1} : ${totalRecu} FCFA reçus, ${attendu} FCFA attendus ` + `(plat ${r.plat} + extras ${r.extras} + boissons ${r.drinks} + livraison ${deliv}${isOffered ? ' offerte' : ''}).`;
    }

    sumTotal += attendu;
  }

  // Affichage groupé : une course = un bloc. Les commandes sans livraison
  // (retrait) sont rassemblées à part — elles n'appartiennent à aucune course.
  const byKey = new Map();
  for (const line of logLines) {
    const k = line.key || '(sans livraison)';
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(line.text);
  }
  for (const [k, lines] of byKey) {
    console.log(`[payAmount]`);
    console.log(`[payAmount] ┌ ${k} — ${lines.length} cmd`);
    lines.forEach(t => console.log(`[payAmount] │ ${t}`));
  }
  console.log(`[payAmount]`);

  // DÉDUCTION panier groupé : une seule course par (boutique+zone+créneau). Ne
  // comptent que les commandes livrées ET NON offertes (celles qui ont payé une
  // course dans leur total).
  const groups = {};
  for (let i = 0; i < orders.length; i++) {
    if (offered.has(i)) continue;
    const key = deliveryGroupKey(orders[i]);
    if (!key) continue;
    (groups[key] ||= []).push(orders[i]);
  }
  let deduction = 0;
  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    const unitPrix = Math.max(0, toNumber(group[0]?.delivery?.prix));
    const dup = group.length - 1;
    deduction += dup * unitPrix;
    console.log(`[payAmount] ⤷ ${key} : ${group.length} cmd → 1 course, déduit ${dup}×${unitPrix}=${dup * unitPrix}`);
  }

  const expected = sumTotal - deduction;
  console.log(`[payAmount] Σtotal=${sumTotal} − groupé=${deduction} → attendu=${expected} | amount=${paid}`);
  if (Math.abs(paid - expected) > AMOUNT_TOLERANCE) {
    console.log(`[payAmount] ✗ amount ${paid} ≠ attendu ${expected} → REFUS\n`);
    return `Montant incohérent : ${paid} FCFA demandés, ${expected} FCFA attendus (total ${sumTotal} − ${deduction} de livraisons groupées).`;
  }

  console.log(`[payAmount] ✓ amount ${paid} == attendu ${expected} → OK\n`);
  return null;
}

module.exports = { validatePaymentAmount, recomputeItemBase, deliveryGroupKey, resolveOfferedDeliveries, AMOUNT_TOLERANCE };
