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
// Rien d'inventé : plat retiré, prix choisi disparu ou zone/créneau disparus
// => `needsReview: true`, prix laissés tels quels. Le paiement les refusera
// (precheck), le client doit refaire son choix.
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

/** Recalcule une commande sur la vue boutique. @returns {{order, changed}} */
function repriceOrder(order, view) {
  const next = { ...order };
  let review = false;

  const menu = (view?.menus || []).find(m => String(m.id) === String(order.menu?.id));
  const idx = Math.max(0, toNumber(order.selectedPriceIndex) - 1);
  if (!menu || !Array.isArray(menu.prices) || !menu.prices[idx]) {
    review = true;
  } else {
    next.menu = { ...order.menu, prices: menu.prices };
    const sync = (list, current) =>
      (list || []).map(it => {
        if (it?.status !== true) return it;
        const cur = (current || []).find(c => (c?.type ?? c?.name) === it.name);
        if (!cur || cur.prix == null) {
          review = true;
          return it;
        }
        return { ...it, prix: toNumber(cur.prix), ...(cur.rawPrice != null ? { rawPrice: toNumber(cur.rawPrice) } : {}) };
      });
    next.extra = sync(order.extra, menu.extra);
    next.drink = sync(order.drink, menu.drink);
  }

  const delivered = order.delivery?.status === true && !!order.delivery?.type && order.delivery.type !== 'aucune';
  const oldPrix = toNumber(order.delivery?.prix);
  // Course offerte : l'ancien total l'excluait (le vrai prix reste dans delivery.prix).
  const offered = delivered && oldPrix > 0 && Math.abs(toNumber(order.total) - baseOf(order)) <= 1;
  let prix = oldPrix;
  if (delivered) {
    const { type, zone, time } = order.delivery;
    const exists = collectZones(view, type, time ?? null).some(z => z.lieu === zone);
    if (!exists) review = true;
    else prix = zoneDeliveryPrice(view, zone, type, time ?? null);
    next.delivery = { ...order.delivery, prix };
  }

  next.total = baseOf(next) + (delivered && !offered ? prix : 0);
  if (view?.pricing?.deliveryBy) next.deliveryBy = view.pricing.deliveryBy;
  next.needsReview = review;

  const changed =
    next.total !== toNumber(order.total) ||
    prix !== oldPrix ||
    next.deliveryBy !== order.deliveryBy ||
    !!next.needsReview !== !!order.needsReview ||
    JSON.stringify(next.menu?.prices) !== JSON.stringify(order.menu?.prices);
  return { order: next, changed };
}

/**
 * @param {string[]|null} ids boutiques modifiées ; null = toutes (réglage global).
 * Ne lève jamais.
 */
async function repriceCartsForShops(ids) {
  try {
    const orders = await repos.orders.query({ status: 'pendingToBuy', orderByCreated: null });
    const wanted = ids ? new Set(ids.map(String)) : null;
    const byShop = new Map();
    for (const o of orders) {
      if (!o.fastFoodId || (wanted && !wanted.has(String(o.fastFoodId)))) continue;
      if (!byShop.has(o.fastFoodId)) byShop.set(o.fastFoodId, []);
      byShop.get(o.fastFoodId).push(o);
    }
    if (byShop.size === 0) return;

    const { getFastFoodsService } = require('../fastfood/getFastFoods');
    const views = await getFastFoodsService(undefined, { ids: [...byShop.keys()] });
    const viewOf = new Map(views.map(v => [String(v.id), v]));
    const io = getIO();
    for (const [shopId, list] of byShop) {
      const view = viewOf.get(String(shopId)) || null; // boutique masquée/indispo : tout à revoir
      for (const o of list) {
        const { order, changed } = view ? repriceOrder(o, view) : { order: { ...o, needsReview: true }, changed: !o.needsReview };
        if (!changed) continue;
        const { id, ...fields } = order;
        const saved = await repos.orders.update(o.id, { menu: fields.menu, extra: fields.extra, drink: fields.drink, delivery: fields.delivery, total: fields.total, deliveryBy: fields.deliveryBy, needsReview: fields.needsReview }).catch(e => {
          console.error(`[repriceCart] commande ${o.id} non mise à jour : ${e.message}`);
          return null;
        });
        if (saved && o.userId) reliableEmit(io, o.userId, 'userOrderUpdated', { data: saved }).catch(e => console.warn(`[repriceCart] emit : ${e.message}`));
      }
    }
  } catch (e) {
    console.error(`[repriceCart] recalcul du panier impossible : ${e.message}`);
  }
}

module.exports = { repriceCartsForShops, repriceOrder };
