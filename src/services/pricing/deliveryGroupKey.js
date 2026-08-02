// ============================================================================
// deliveryGroupKey — Clé UNIQUE de regroupement des courses
// ============================================================================
// Deux commandes ne partagent une course que si elles partent au même moment,
// de la même boutique, vers la même zone. Le panier étant libre (aucune
// contrainte d'uniformité), c'est cette clé SEULE qui décide combien de courses
// existent réellement.
//
// ⚠️ Cette définition est la SEULE autorisée, et elle est partagée par les deux
// moments où l'on compte les courses :
//
//   • `validatePaymentAmount` — ce que le user PAIE (déduction des courses
//     mutualisées avant l'appel MobileWallet) ;
//   • `settleDelivery`        — ce qui est VERSÉ et tracé (`order_deliveries` :
//     `delivery_group_id`, `course_billed`).
//
// Historique du bug qu'elle corrige : `settleDelivery` groupait sur le seul
// `fastFoodId`. C'était juste tant qu'un validateur imposait zone/date/créneau
// identiques par boutique — mais ce validateur a été supprimé (panier libre).
// Résultat : un panier avec un plat en express et un autre programmé le
// lendemain dans une autre zone était facturé 2 courses au user et n'en versait
// qu'1, l'écart tombant silencieusement en marge plateforme.
//
// Toute divergence entre les deux moments produit une comptabilité fausse : ne
// jamais réimplémenter cette clé ailleurs.
// ============================================================================

/**
 * Clé de groupe d'une commande, ou `null` si elle ne porte aucune course.
 *
 * Composition — chaque terme distingue un départ d'un autre :
 * - `fastFoodId` + `zone` : un déplacement, une destination ;
 * - `type` : un express et un programmé ne partent jamais ensemble, même à la
 *   même heure apparente ;
 * - `date` : deux courses de jours différents sont deux courses ;
 * - `time` : uniquement en `type === 'time'`. L'express n'a pas de créneau (il
 *   part dès que c'est prêt) et `validateExpressDelivery` refuse en amont toute
 *   commande express portant une heure — l'ignorer ici serait donc sans effet.
 *
 * @param {Object} order commande portant `fastFoodId` et `delivery`
 * @returns {string|null} `null` = retrait sur place, aucune course
 */
function deliveryGroupKey(order) {
  const d = order?.delivery;
  if (!d || d.status !== true) return null; // retrait : aucune course

  const zone = String(d.zone ?? '')
    .trim()
    .toLowerCase();
  const type = String(d.type ?? '')
    .trim()
    .toLowerCase();
  const date = String(d.date ?? '').trim();

  const base = `${order.fastFoodId}|${zone}|${type}|${date}`;
  return type === 'time' ? `${base}|${String(d.time ?? '').trim()}` : base;
}

module.exports = { deliveryGroupKey };
