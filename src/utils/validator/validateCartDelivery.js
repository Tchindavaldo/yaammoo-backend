// ============================================================================
// validateCartDelivery — Cohérence des livraisons d'un panier
// ============================================================================
// Une commande = un plat. Un panier de plusieurs plats arrive donc comme
// plusieurs commandes — mais chez une même boutique, le livreur ne fait qu'UN
// déplacement. Il ne peut donc pas y avoir deux modes ou deux créneaux de
// livraison différents pour la même boutique.
//
// Contrôle par BOUTIQUE, pas sur le panier entier : deux boutiques différentes
// font deux courses indépendantes, chacune avec son propre créneau.
//
// Les commandes en retrait (`delivery.status !== true`) sont ignorées : elles
// n'engagent aucune course.
//
// ⚠️ Doit passer AVANT le paiement : une fois encaissé, on ne peut plus refuser
// un panier incohérent sans avoir à rembourser.
// ============================================================================

// Ce qui doit être identique au sein d'une même boutique.
const COMPARED_FIELDS = ['type', 'date', 'time'];

const LABELS = { type: 'type de livraison', date: 'date de livraison', time: 'heure de livraison' };

/** Valeur normalisée d'un champ, pour comparer sans faux positif de casse/espaces. */
function normalize(value) {
  return value === undefined || value === null ? '' : String(value).trim().toLowerCase();
}

/**
 * @param {Array} items commandes du panier (objets-commande complets)
 * @returns {string|null} message d'erreur, ou null si le panier est cohérent
 */
function validateCartDelivery(items) {
  const orders = Array.isArray(items) ? items : [items];
  // Un seul plat : rien à comparer.
  if (orders.length < 2) return null;

  const byFastFood = {};
  for (const order of orders) {
    if (!order || order.delivery?.status !== true) continue;
    const ffId = order.fastFoodId;
    if (!ffId) continue;
    if (!byFastFood[ffId]) byFastFood[ffId] = [];
    byFastFood[ffId].push(order);
  }

  for (const [fastFoodId, group] of Object.entries(byFastFood)) {
    if (group.length < 2) continue;

    const reference = group[0].delivery;
    for (const order of group.slice(1)) {
      for (const field of COMPARED_FIELDS) {
        // `time` n'a de sens que pour une livraison programmée.
        if (field === 'time' && normalize(reference.type) !== 'time') continue;
        if (normalize(reference[field]) === normalize(order.delivery?.[field])) continue;

        return (
          `Les commandes d'une même boutique doivent partager la même livraison : ` +
          `${LABELS[field]} différent (« ${reference[field] ?? '—'} » et « ${order.delivery?.[field] ?? '—'} »). ` +
          `Boutique ${fastFoodId}.`
        );
      }
    }
  }

  return null;
}

module.exports = { validateCartDelivery, COMPARED_FIELDS };
