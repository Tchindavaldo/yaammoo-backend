// ============================================================================
// toMerchantView — Une commande vue par le fastfood
// ============================================================================
// Le client paie un prix TOUT COMPRIS : livraison, marge plateforme et frais du
// prestataire sont fondus dans le prix de chaque plat, sans jamais apparaître en
// ligne. Servir ce même montant au marchand lui montre un argent qu'il n'a pas
// touché — d'où cette vue, qui restitue :
//
//   • les prix RÉELS du fastfood (`rawPrice`, figé dans la commande à l'achat)
//   • `total`         = ce que le marchand encaisse pour CETTE commande
//   • `customerTotal` = ce que le client a payé (l'ancien `total`)
//
// L'écart entre les deux est la rémunération de la plateforme. Il n'est pas
// détaillé ici : la marge n'est jamais exposée (cf. `/settings/pricing`).
//
// ⚠️ Réservée au MARCHAND. Le client et le LIVREUR gardent les prix affichés :
// le livreur est l'interface avec le client, et un montant annoncé différent de
// celui payé créerait un litige à chaque livraison.
//
// ⚠️ Une seule course par DÉPART. Un panier de 3 plats chez la même boutique
// fait 3 commandes mais UN déplacement : la livraison n'est ajoutée qu'à la
// commande qui la porte, sinon la boutique verrait N fois la course. La règle
// est celle de `settleDelivery` — `courseBilled` quand le règlement existe,
// `deliveryGroupKey` sinon (commande pas encore payée).
// ============================================================================

const repos = require('../../repositories');
const { toNumber } = require('../pricing/deliveryPricing');
const { deliveryGroupKey } = require('../pricing/deliveryGroupKey');

/** Prix réel d'une ligne : `rawPrice` s'il a été figé, sinon le prix affiché. */
const rawOf = item => (item?.rawPrice == null ? toNumber(item?.prix) : toNumber(item.rawPrice));

/** Somme des lignes cochées, chacune multipliée par son facteur. */
function sumChecked(list, factorOf) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, it) => (it?.status === true ? sum + rawOf(it) * factorOf(it) : sum), 0);
}

/** Le menu de la commande, ses prix affichés remplacés par les prix réels. */
function menuToRaw(menu) {
  if (!menu) return menu;
  const out = { ...menu };

  if (Array.isArray(menu.prices)) {
    out.prices = menu.prices.map(p => (p?.rawPrice == null ? p : { ...p, price: toNumber(p.rawPrice) }));
  }
  for (const field of ['extra', 'drink']) {
    if (!Array.isArray(menu[field])) continue;
    out[field] = menu[field].map(i => (i?.rawPrice == null ? i : { ...i, prix: toNumber(i.rawPrice) }));
  }

  return out;
}

/**
 * Montant marchand des ARTICLES seuls (hors course).
 * Repli utilisé tant qu'aucun règlement n'existe : `selectedPriceIndex` est en
 * base 1, comme dans `validatePaymentAmount`.
 */
function rawItemsTotal(order) {
  const prices = order?.menu?.prices;
  const idx = Math.max(0, toNumber(order?.selectedPriceIndex) - 1);
  const unit = Array.isArray(prices) ? rawOf({ rawPrice: prices[idx]?.rawPrice, prix: prices[idx]?.price }) : 0;
  const qty = Math.max(1, toNumber(order?.quantity) || 1);

  const extras = sumChecked(order?.extra, () => 1);
  const drinks = sumChecked(order?.drink, d => Math.max(1, toNumber(d?.quantite) || 1));

  return unit * qty + extras + drinks;
}

/**
 * Vue marchand d'UNE commande (émissions socket).
 *
 * ⚠️ Isolée de son panier, une commande est seule dans son groupe : le repli
 * « qui porte la course » la désigne donc toujours. Sans effet une fois la
 * commande réglée (`courseBilled` fait alors autorité), ce qui est le cas de
 * toutes les transitions de statut émises en socket.
 */
exports.toMerchantViewOne = async order => {
  if (!order) return order;
  const [view] = await exports.toMerchantView([order]);
  return view;
};

/**
 * Bascule N commandes en vue marchand.
 *
 * Lecture des règlements en UN appel pour N commandes (pas de N+1). Non
 * bloquant : un incident comptable ne doit jamais casser la récupération des
 * commandes — on journalise et on retombe sur le calcul depuis les prix figés.
 *
 * @param {Array} orders commandes déjà mappées (et enrichies de leur course)
 * @returns {Promise<Array>} les mêmes commandes, en montants marchands
 */
exports.toMerchantView = async orders => {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) return list;

  let settlements = {};
  try {
    settlements = await repos.orderSettlements.getByOrders(list.map(o => o.id).filter(Boolean));
  } catch (error) {
    console.error('toMerchantView: règlements non lus (montants recalculés) —', error.message);
  }

  // Repli sans règlement : qui porte la course. Même clé que `settleDelivery`,
  // pour que le nombre de courses comptées ne diverge jamais.
  const billedOrderByKey = {};
  for (const order of list) {
    const key = deliveryGroupKey(order);
    if (key && billedOrderByKey[key] === undefined) billedOrderByKey[key] = order.id;
  }

  return list.map(order => {
    const settlement = settlements[order.id];
    const customerTotal = toNumber(order.total);

    // La course revient au marchand telle qu'elle a été versée. `courseBilled`
    // fait autorité dès que le règlement existe ; sinon on la déduit du groupe.
    const key = deliveryGroupKey(order);
    const holdsCourse = settlement ? order.courseBilled === true : !!key && billedOrderByKey[key] === order.id;
    const course = holdsCourse ? toNumber(order.delivery?.prix) : 0;

    const items = settlement ? toNumber(settlement.itemsReal) : rawItemsTotal(order);

    return {
      ...order,
      menu: menuToRaw(order.menu),
      extra: Array.isArray(order.extra) ? order.extra.map(e => (e?.rawPrice == null ? e : { ...e, prix: toNumber(e.rawPrice) })) : order.extra,
      drink: Array.isArray(order.drink) ? order.drink.map(d => (d?.rawPrice == null ? d : { ...d, prix: toNumber(d.rawPrice) })) : order.drink,
      total: items + course,
      customerTotal,
    };
  });
};
