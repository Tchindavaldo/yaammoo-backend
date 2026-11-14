// ============================================================================
// precheckSuggestions — Que doit changer le marchand pour que la commande passe ?
// ============================================================================
// Appelé par settlementPrecheck quand une commande est refusée pour marge
// négative. Comme les « prix proches valides » de la création de menu, on
// propose des VALEURS qui passent, calculées en rejouant le règlement simulé
// (dryRun) — jamais une formule recopiée :
//   - la course MAXIMALE pour cette zone / ce créneau (multiple de 50, vers le bas) ;
//   - le prix RÉEL minimum du plat (multiple de 50, vers le haut), qui respecte
//     aussi la règle de la page menu (isPriceAcceptable).
// Régime plateforme : les zones sont celles de la plateforme, le marchand n'y
// peut rien → seul « contacter l'administrateur » est proposé.
// Puis notifie le marchand (push), au plus une fois par heure et par cas.
// ============================================================================
const repos = require('../../repositories');
const { settleDeliveryService } = require('./settleDelivery.service');
const { toNumber, isPlatformDelivered, deliverySource, zoneDeliveryPrice } = require('../pricing/deliveryPricing');
const { surplusOf, isPriceAcceptable } = require('../pricing/menuPriceGuard');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

const STEP = 50;
const BRUT_SPAN = 3000;
const NOTIFY_EVERY_MS = 60 * 60 * 1000;
const lastNotified = new Map();

/** Le lot passe-t-il (toutes les marges >= 0) ? */
async function passes(list, ctx, fastfoodOverrides) {
  const s = await settleDeliveryService({ orders: list, bonusCode: ctx.bonusCode, payment: ctx.payment, dryRun: true, fastfoodOverrides });
  return !s.error && s.settlements.length === list.length && s.settlements.every(x => toNumber(x.platformMargin) >= 0);
}

/**
 * Boutique dont la zone vaut `price`. EXPRESS : la liste `expressZones`, sans
 * heure (migration 073). PÉRIODIQUE : le lieu dans le créneau de la commande.
 */
function withZonePrice(shop, d, price) {
  const setPrice = list => (Array.isArray(list) ? list.map(z => (z?.lieu === d.zone ? { ...z, prix: String(price) } : z)) : list);
  if (d.type === 'express') return { ...shop, expressZones: setPrice(shop.expressZones) };
  const hours = (shop.deliveryHours || []).map(h => {
    if (!h || typeof h !== 'object' || (d.time && h.hour !== d.time)) return h;
    return { ...h, periodicZones: setPrice(h.periodicZones) };
  });
  return { ...shop, deliveryHours: hours };
}

/**
 * @returns {Promise<{ platform:boolean, maxCourse:number|null, minBrut:number|null, currentCourse:number|null, currentBrut:number|null }>}
 */
exports.suggestFixes = async ({ list, index, offered, ctx }) => {
  const order = list[index];
  const shop = await repos.fastfoods.getById(order.fastFoodId);
  const out = { platform: false, maxCourse: null, minBrut: null, currentCourse: null, currentBrut: null, shop };
  if (!shop || isPlatformDelivered(shop)) return { ...out, platform: true };

  const d = order.delivery || {};
  const isOffered = offered?.has?.(index);

  // 1. Course maximale.
  if (d.status === true && d.zone) {
    const current = zoneDeliveryPrice(deliverySource(shop), d.zone, d.type, d.time ?? null);
    out.currentCourse = current;
    for (let c = Math.floor((current - 1) / STEP) * STEP; c >= 0; c -= STEP) {
      const trial = list.map((o, i) => (i !== index || isOffered ? o : { ...o, total: toNumber(o.total) - toNumber(d.prix) + c, delivery: { ...d, prix: c } }));
      if (await passes(trial, ctx, { [shop.id]: withZonePrice(shop, d, c) })) {
        out.maxCourse = c;
        break;
      }
    }
  }

  // 2. Prix réel minimum du plat (même règle que la page menu).
  const prices = order.menu?.prices;
  const idx = Math.max(0, toNumber(order.selectedPriceIndex) - 1);
  if (Array.isArray(prices) && prices[idx]) {
    const qty = Math.max(1, toNumber(order.quantity) || 1);
    const brut = toNumber(prices[idx].rawPrice ?? prices[idx].price);
    const shown = toNumber(prices[idx].price);
    out.currentBrut = brut;
    const pricing = ctx.pricing;
    for (let b = Math.ceil((brut + 1) / STEP) * STEP; b <= brut + BRUT_SPAN; b += STEP) {
      if (!isPriceAcceptable(b, pricing)) continue;
      const displayed = surplusOf(b, pricing).displayed;
      const newPrices = prices.map((p, i) => (i === idx ? { ...p, rawPrice: b, price: displayed } : p));
      const trial = list.map((o, i) => (i !== index ? o : { ...o, total: toNumber(o.total) + (displayed - shown) * qty, menu: { ...o.menu, prices: newPrices } }));
      if (await passes(trial, ctx, null)) {
        out.minBrut = b;
        break;
      }
    }
  }
  return out;
};

/** Message lisible pour le marchand, avec les valeurs proposées. */
exports.merchantMessage = (order, s) => {
  const d = order.delivery || {};
  const plat = order.menu?.name || order.menu?.titre || 'votre plat';
  if (s.platform) return `Une commande a été refusée : son montant ne couvre pas la livraison plateforme. Contactez l'administrateur Yaammoo.`;
  const parts = [];
  if (s.maxCourse !== null) parts.push(`baissez la livraison ${d.zone}${d.time ? ` (${d.time})` : ''} de ${s.currentCourse} F à ${s.maxCourse} F au plus`);
  if (s.minBrut !== null) parts.push(`passez le prix de « ${plat} » de ${s.currentBrut} F à ${s.minBrut} F au moins`);
  const fix = parts.length ? `Pour l'accepter, ${parts.join(', ou ')}.` : `Aucun ajustement simple trouvé.`;
  return `Une commande a été refusée : la livraison n'est pas couverte par le prix. ${fix} Sinon, contactez l'administrateur Yaammoo.`;
};

/** Push au marchand, au plus une fois par heure pour une même boutique / zone / plat. */
exports.notifyMerchant = async (order, s, message) => {
  const userId = s.shop?.userId;
  if (!userId) return false;
  const key = `${order.fastFoodId}|${order.delivery?.zone}|${order.delivery?.time}|${order.menu?.id}`;
  if (Date.now() - (lastNotified.get(key) || 0) < NOTIFY_EVERY_MS) return false;
  lastNotified.set(key, Date.now());
  await notifyOrderEvent({ targetUserId: userId, type: 'pricing_alert', title: 'Commande refusée : prix à ajuster', body: message, route: '', audience: 'merchant' }).catch(e => console.warn(`[precheckSuggestions] push marchand : ${e.message}`));
  return true;
};
