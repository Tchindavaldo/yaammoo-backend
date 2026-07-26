// ============================================================================
// validateExpressDelivery — L'express ne porte JAMAIS d'heure
// ============================================================================
// `express` signifie « dès que c'est prêt » : la course part sans créneau. Une
// heure sur une commande express est donc une contradiction — soit le front
// s'est trompé de mode, soit il a laissé traîner un `time` d'un choix précédent.
//
// On refuse AVANT le paiement : accepter ici produirait une commande dont le
// créneau ne veut rien dire, et le groupement de course (clé sans heure en
// express) la regrouperait avec des commandes qui ne partent pas au même moment.
//
// Les commandes en retrait (`delivery.status !== true`) n'engagent aucune
// course : elles ne sont pas concernées.
// ============================================================================

/**
 * @param {Array|Object} items commandes du panier (objets-commande complets)
 * @returns {string|null} message d'erreur, ou null si rien à signaler
 */
function validateExpressDelivery(items) {
  const orders = Array.isArray(items) ? items : items ? [items] : [];

  for (let i = 0; i < orders.length; i++) {
    const delivery = orders[i]?.delivery;
    if (!delivery || delivery.status !== true) continue;

    const type = String(delivery.type ?? '')
      .trim()
      .toLowerCase();
    if (type !== 'express') continue;

    const time = String(delivery.time ?? '').trim();
    if (!time) continue;

    return `Commande #${i + 1} : une livraison express ne peut pas porter d'heure ` + `(« ${time} » reçue). L'express part dès que la commande est prête ; ` + `pour choisir un créneau, utilisez le type « time ».`;
  }

  return null;
}

module.exports = { validateExpressDelivery };
