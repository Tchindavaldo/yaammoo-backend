// ============================================================================
// repriceCart — Panier (pendingToBuy) aligné sur les prix ACTUELS des boutiques
// ============================================================================
// Une commande `pendingToBuy` n'est qu'un article du panier : rien n'est payé.
// Quand une boutique change (prix, zones, créneaux, express, régime, réglage
// global), ses articles de panier sont recalculés sur sa VUE HOME (la même que
// celle servie au client, `getFastFoodsService({ ids })`) :
//   - plat : `menu.prices` (prix affiché + rawPrice) du menu actuel ;
//   - extras / boissons cochés : `prix` + `rawPrice` actuels (par nom) ;
//   - course : tarif de la zone, TYPE + CRÉNEAU choisis (`zoneDeliveryPrice`) ;
//   - total : plat × qté + extras + boissons + course (sauf course offerte,
//     reconnue à l'ancien total qui l'excluait) ;
//   - `deliveryBy` : régime effectif actuel.
// Puis `userOrderUpdated { data: order }` au client (l'app l'applique).
//
// Rien d'inventé : plat supprimé, prix choisi disparu, extra/boisson cochés
// disparus, zone ou créneau disparus => `needsReview: true`, le reste est mis
// à jour. Le paiement les refusera (precheck), le client refait son choix.
// Boutique fermée ou plat seulement indisponible : panier non touché.
// ============================================================================
const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { toNumber, zoneDeliveryPrice, collectZones } = require('../pricing/deliveryPricing');

const qtyOf = v => Math.max(1, toNumber(v) || 1);

function baseOf(order) {
  const prices = order?.menu?.prices;
  const idx = Math.max(0, toNumber(order?.selectedPriceIndex) - 1);
  const unit = Array.isArray(prices) ? toNumber(prices[idx]?.price) : 0;
  const extras = (order.extra || []).reduce((s, e) => (e?.status === true ? s + toNumber(e.prix) : s), 0);
  const drinks = (order.drink || []).reduce((s, d) => (d?.status === true ? s + toNumber(d.prix) * qtyOf(d.quantite) : s), 0);
  return unit * qtyOf(order.quantity) + extras + drinks;
}

/** Zone choisie présente dans la vue ? Périodique : dans SON créneau exactement. */
function zoneExists(view, type, zone, time) {
  if (type === 'time' && time) {
    // `collectZones` retombe sur toutes les heures quand le créneau a disparu :
    // ici, un créneau supprimé doit compter comme disparu.
    const slot = (view?.deliveryHours || []).find(h => h && typeof h === 'object' && h.hour === time);
    return !!slot && (slot.periodicZones || []).some(z => z?.lieu === zone);
  }
  return collectZones(view, type, time ?? null).some(z => z?.lieu === zone);
}

/**
 * Recalcule une commande sur la vue boutique.
 * Plat absent de la vue (indisponible, ou supprimé) : `{ missingMenu: true }`,
 * la commande n'est pas touchée ; l'appelant décide.
 * @returns {{order, changed, missingMenu?}}
 */
function repriceOrder(order, view) {
  const menu = (view?.menus || []).find(m => String(m.id) === String(order.menu?.id));
  if (!menu) return { order, changed: false, missingMenu: true };

  const next = { ...order };
  let review = false;

  // Plat : prix actuels. Ancien plat sans `prices[]` (données legacy) : on ne
  // touche pas au prix plutôt que de le déclarer disparu.
  const idx = Math.max(0, toNumber(order.selectedPriceIndex) - 1);
  if (Array.isArray(menu.prices) && menu.prices.length > 0) {
    if (!menu.prices[idx]) review = true;
    else next.menu = { ...order.menu, prices: menu.prices };
  }

  // Extras / boissons : TOUS remis aux prix actuels (l'écran d'édition du
  // panier relit cette liste, cochés ou non). Disparu : seul un élément COCHÉ
  // rend la commande « à revoir ».
  const sync = (list, current) =>
    (list || []).map(it => {
      const cur = (current || []).find(c => (c?.type ?? c?.name) === it?.name);
      if (!cur || cur.prix == null) {
        if (it?.status === true) review = true;
        return it;
      }
      return { ...it, prix: toNumber(cur.prix), ...(cur.rawPrice != null ? { rawPrice: toNumber(cur.rawPrice) } : {}) };
    });
  next.extra = sync(order.extra, menu.extra);
  next.drink = sync(order.drink, menu.drink);

  const delivered = order.delivery?.status === true && !!order.delivery?.type && order.delivery.type !== 'aucune';
  const oldPrix = toNumber(order.delivery?.prix);
  // Course offerte : l'ancien total l'excluait (le vrai prix reste dans delivery.prix).
  // Elle ne le reste que si la cause tient encore : code bonus porté par la
  // commande, ou campagne globale toujours active sur la boutique. Campagne
  // terminée : la course revient dans le total (panier à jour, pas de refus).
  const wasOffered = delivered && oldPrix > 0 && Math.abs(toNumber(order.total) - baseOf(order)) <= 1;
  const stillOffered = !!(order.bonusCode || order.delivery?.bonusCode) || (view?.deliveryOffer?.active === true && view.deliveryOffer.reason === 'campaign');
  const offered = wasOffered && stillOffered;
  let prix = oldPrix;
  if (delivered) {
    const { type, zone, time } = order.delivery;
    if (!zoneExists(view, type, zone, time)) review = true;
    else prix = zoneDeliveryPrice(view, zone, type, time ?? null);
    next.delivery = { ...order.delivery, prix };
  }

  next.total = baseOf(next) + (delivered && !offered ? prix : 0);
  if (view?.pricing?.deliveryBy) next.deliveryBy = view.pricing.deliveryBy;
  next.needsReview = review;

  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changed =
    next.total !== toNumber(order.total) ||
    prix !== oldPrix ||
    next.deliveryBy !== order.deliveryBy ||
    !!next.needsReview !== !!order.needsReview ||
    !same(next.menu?.prices, order.menu?.prices) ||
    !same(next.extra, order.extra) ||
    !same(next.drink, order.drink);
  return { order: next, changed };
}

/**
 * Recalcule une liste de commandes `pendingToBuy`, enregistre celles qui
 * changent. `emit` : pousse `userOrderUpdated` au client (pas utile au GET,
 * qui renvoie déjà la liste à jour).
 * @returns {Promise<Map<string,Object>>} id -> commande enregistrée
 */
async function repriceOrders(orders, { emit = true } = {}) {
  const saved = new Map();
  const byShop = new Map();
  for (const o of orders) {
    if (o?.status !== 'pendingToBuy' || !o.fastFoodId) continue;
    if (!byShop.has(o.fastFoodId)) byShop.set(o.fastFoodId, []);
    byShop.get(o.fastFoodId).push(o);
  }
  if (byShop.size === 0) return saved;

  const { getFastFoodsService } = require('../fastfood/getFastFoods');
  const views = await getFastFoodsService(undefined, { ids: [...byShop.keys()] });
  const viewOf = new Map(views.map(v => [String(v.id), v]));
  const io = emit ? getIO() : null;
  for (const [shopId, list] of byShop) {
    // Boutique absente de la vue (fermée, indisponible, masquée) : rien n'a
    // changé de prix, on ne touche pas au panier. Les contrôles de
    // disponibilité du paiement s'en chargent.
    const view = viewOf.get(String(shopId));
    if (!view) continue;
    for (const o of list) {
      let { order, changed, missingMenu } = repriceOrder(o, view);
      if (missingMenu) {
        // Plat seulement indisponible : panier inchangé. Plat SUPPRIMÉ : à revoir.
        const stillThere = await repos.menus.getById(o.menu?.id).catch(() => true);
        if (stillThere) continue;
        order = { ...o, needsReview: true };
        changed = !o.needsReview;
      }
      if (!changed) continue;
      const row = await repos.orders.update(o.id, { menu: order.menu, extra: order.extra, drink: order.drink, delivery: order.delivery, total: order.total, deliveryBy: order.deliveryBy, needsReview: order.needsReview }).catch(e => {
        console.error(`[repriceCart] commande ${o.id} non mise à jour : ${e.message}`);
        return null;
      });
      if (!row) continue;
      saved.set(String(o.id), row);
      if (io && o.userId) reliableEmit(io, o.userId, 'userOrderUpdated', { data: row }).catch(e => console.warn(`[repriceCart] emit : ${e.message}`));
    }
  }
  return saved;
}

/**
 * Boutiques modifiées (ids) ou toutes (null, réglage global). Ne lève jamais.
 */
async function repriceCartsForShops(ids) {
  try {
    const wanted = ids ? new Set(ids.map(String)) : null;
    const orders = await repos.orders.query({ status: 'pendingToBuy', orderByCreated: null });
    await repriceOrders(orders.filter(o => !wanted || wanted.has(String(o.fastFoodId))));
  } catch (e) {
    console.error(`[repriceCart] recalcul du panier impossible : ${e.message}`);
  }
}

/**
 * GET des commandes du user : le panier est recalculé AVANT la réponse. Un
 * socket raté, une app fermée ou une modification faite en base sont ainsi
 * rattrapés à chaque ouverture / retour au premier plan. Ne lève jamais.
 */
async function withRepricedCart(orders) {
  try {
    const saved = await repriceOrders(orders, { emit: false });
    return saved.size ? orders.map(o => saved.get(String(o.id)) || o) : orders;
  } catch (e) {
    console.error(`[repriceCart] panier non recalculé au GET : ${e.message}`);
    return orders;
  }
}

module.exports = { repriceCartsForShops, repriceOrder, withRepricedCart };
