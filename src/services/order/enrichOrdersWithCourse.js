// ============================================================================
// enrichOrdersWithCourse — Qui porte la course d'un panier
// ============================================================================
// Une commande = UN plat. Un panier de 3 plats chez la même boutique fait donc
// 3 commandes, alors que le livreur ne se déplace qu'UNE fois. `settleDelivery`
// tranche déjà ce cas en base (migration 021) :
//
//   deliveryGroupId → commandes du même panier ET de la même boutique
//   courseBilled    → TRUE sur une SEULE ligne du groupe
//
// Sans ces deux champs, le front ne peut pas savoir que la livraison d'une
// commande est portée par une autre, et affiche N frais pour une seule course.
//
// Seuls ces deux champs sortent : les montants (`realPrice`, `chargedPrice`,
// `platformMargin`) restent comptables, jamais exposés au client.
//
// Une commande à emporter n'a pas de ligne `order_deliveries` : les deux champs
// restent alors ABSENTS (comme `driverId` ou `groupId` non renseignés).
// ============================================================================
const repos = require('../../repositories');

/**
 * Ajoute `deliveryGroupId` et `courseBilled` à chaque commande qui a une course.
 *
 * Lecture en UN seul appel DB pour N commandes (pas de N+1).
 * Non bloquant : un incident sur la table comptable ne doit jamais casser la
 * récupération de commandes — on journalise et on renvoie les commandes brutes.
 *
 * @param {Array} orders commandes déjà mappées
 * @returns {Promise<Array>} les mêmes commandes, enrichies quand une course existe
 */
exports.enrichOrdersWithCourse = async orders => {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) return list;

  try {
    const byOrder = await repos.orderDeliveries.getByOrders(list.map(o => o.id).filter(Boolean));

    return list.map(order => {
      const course = byOrder[order.id];
      if (!course) return order;
      return {
        ...order,
        deliveryGroupId: course.deliveryGroupId,
        courseBilled: course.courseBilled,
      };
    });
  } catch (error) {
    console.error('enrichOrdersWithCourse: courses non lues (commandes servies telles quelles) —', error.message);
    return list;
  }
};
