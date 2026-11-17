// Commandes vues par l'agent IA WhatsApp : celles des boutiques du numéro, en VUE MARCHAND
// (`toMerchantView` : `total` = ce que le marchand encaisse, jamais le prix client ni la
// marge). Chargées d'office : les commandes EN COURS seulement (décision du 17/11/2026 :
// l'IA gère les commandes, elle ne lit pas l'historique ; détail : l'app). Sur demande :
// les autres en cours par pages (searchOrders), une commande par son n° (findOrder, sans
// limite de date : litige), le bilan d'un jour (daySummary). Résolution des références écrites par le marchand
// (« A1B2C3 », « n°a1b2c3 », id complet). Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const msg = require('../merchantMessages');

// Statuts qu'un marchand peut voir : tout sauf le panier client non payé (`pendingToBuy`).
const MERCHANT_STATUSES = ['pending', 'processing', 'finished', 'delivering', 'delivered', 'cancelByFastFood', 'cancelByUser'];
const ACTIVE = ['pending', 'processing', 'finished', 'delivering'];

const TZ = 'Africa/Douala';
const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** « 16/11 14:05 » (heure du Cameroun). */
const when = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fmt.format(d);
};

/** Commande -> objet lu par le modèle (aucune donnée personnelle du client). `drivers` : uid -> nom. */
const viewOf = (o, shopName, drivers = {}) => ({
  ref: msg.ref(o),
  id: o.id,
  boutique: shopName,
  statut: o.status,
  statutLibelle: msg.statusLabel(o.status),
  plats: msg.plats(o),
  livraison: msg.livraison(o),
  montantMarchandFcfa: Math.round(Number(o.total) || 0),
  passeeLe: when(o.createdAt),
  ...(o.groupId ? { panier: String(o.groupId).slice(-6).toUpperCase() } : {}),
  ...(o.driverId ? { livreur: drivers[o.driverId] || 'un livreur' } : {}),
  // Demande d'annulation du client (boutique WhatsApp, cancelRequest.service).
  ...(o.cancelRequest?.status === 'pending' ? { demandeAnnulation: 'en attente de la réponse du marchand' } : {}),
  ...(o.cancelRequest?.status === 'refused' ? { demandeAnnulation: 'refusée' } : {}),
});

/** Commandes en cours (tout âge), plus récentes d'abord. */
const loadActive = async ({ fastFoodIds, driverId }) => (await repos.orders.searchForAgent({ fastFoodIds, driverId, status: ACTIVE })).orders;

/** Commandes (brutes) -> { raw: vue marchand, views: pour le modèle }. */
const merchantViews = async (orders, shops) => {
  const { toMerchantView } = require('../../order/toMerchantView');
  const byId = new Map(shops.map(s => [s.id, s]));
  const raw = orders.length ? await toMerchantView(orders) : [];
  const drivers = await driverNames(raw.filter(o => ACTIVE.includes(o.status)));
  return { raw, views: raw.map(o => viewOf(o, byId.get(o.fastFoodId)?.name, drivers)) };
};

/**
 * Commandes en cours des boutiques, chargées d'office.
 * @returns {Promise<{ raw: object[], views: object[] }>} raw = commandes (vue marchand), views = pour le modèle
 */
exports.loadShopOrders = async shops => merchantViews(await loadActive({ fastFoodIds: shops.map(s => s.id) }), shops);

/** uid -> nom des livreurs assignés aux commandes. */
const driverNames = async orders => {
  const { nameOf } = require('../driver/driverDirectory');
  const out = {};
  for (const id of new Set(orders.map(o => o.driverId).filter(Boolean))) out[id] = nameOf(await repos.users.getUserByIdSafe(id));
  return out;
};

/**
 * Vue livreur : raw = commandes telles quelles (fiche du livreur) ; views = pour le modèle,
 * avec la part de la boutique (vue marchand) et SANS coordonnées du client.
 */
const driverViews = async (raw, shops) => {
  const { toMerchantView } = require('../../order/toMerchantView');
  const byId = new Map(shops.map(s => [s.id, s]));
  const merchant = raw.length ? await toMerchantView(raw.map(o => ({ ...o }))) : [];
  const amount = new Map(merchant.map(o => [o.id, Math.round(Number(o.total) || 0)]));
  const views = raw.map(o => {
    // montantMarchandFcfa de viewOf est ici le total CLIENT (commande brute) : jamais montré.
    const { montantMarchandFcfa, livreur, ...v } = viewOf(o, byId.get(o.fastFoodId)?.name);
    return { ...v, partBoutiqueFcfa: amount.get(o.id) ?? null };
  });
  return { raw, views };
};

/** Commandes en cours confiées au livreur `uid` dans ses boutiques WhatsApp, chargées d'office. */
exports.loadDriverOrders = async (uid, shops) => driverViews(await loadActive({ fastFoodIds: shops.map(s => s.id), driverId: uid }), shops);

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** `jour` valide (AAAA-MM-JJ) sinon aujourd'hui à Douala ; bornes ISO de ce jour (UTC+1, sans heure d'été). */
const dayBounds = jour => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(jour || '')) && !Number.isNaN(Date.parse(`${jour}T00:00:00+01:00`)) ? jour : dayFmt.format(new Date());
  const start = Date.parse(`${d}T00:00:00+01:00`);
  return { jour: d, from: new Date(start).toISOString(), to: new Date(start + 864e5).toISOString() };
};

/**
 * Outils list_orders / list_my_orders : commandes EN COURS (tout âge) seulement, filtrées
 * par `statuts` (parmi les en cours), `pageSize` par page (1…). Les terminées ne se listent
 * pas sur WhatsApp (décision du 17/11/2026 : l'app pour l'historique). `driverId` = vue
 * livreur. Renvoie { views, page, pageSuivante }.
 */
exports.searchOrders = async ({ shops, driverId, statuts, page, pageSize }) => {
  const wanted = (statuts || []).filter(st => ACTIVE.includes(st));
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const { orders, hasMore } = await repos.orders.searchForAgent({
    fastFoodIds: shops.map(s => s.id),
    driverId,
    status: wanted.length ? wanted : ACTIVE,
    limit: pageSize,
    offset: (p - 1) * pageSize,
  });
  const { views } = driverId ? await driverViews(orders, shops) : await merchantViews(orders, shops);
  return { views, page: p, pageSuivante: hasMore };
};

/**
 * Bilan d'UN jour (aujourd'hui par défaut) : nombre de commandes passées ce jour-là par
 * statut, et somme de ce que la boutique encaisse (vue marchand) pour les livrées. Quelques
 * lignes au lieu de la liste : c'est ce que l'agent envoie pour « faire le compte ».
 */
exports.daySummary = async ({ shops, jour }) => {
  const day = dayBounds(jour);
  const { orders } = await repos.orders.searchForAgent({ fastFoodIds: shops.map(s => s.id), status: MERCHANT_STATUSES, createdAfter: day.from, createdBefore: day.to });
  const { toMerchantView } = require('../../order/toMerchantView');
  const merchant = orders.length ? await toMerchantView(orders) : [];
  const parStatut = {};
  let livrees = 0;
  for (const o of merchant) {
    const label = msg.statusLabel(o.status);
    parStatut[label] = (parStatut[label] || 0) + 1;
    if (o.status === 'delivered') livrees += Math.round(Number(o.total) || 0);
  }
  return { jour: day.jour, commandes: merchant.length, parStatut, montantMarchandLivreesFcfa: livrees };
};

/**
 * Une commande par sa référence : d'abord parmi `loaded` (déjà chargées), sinon en base,
 * sans limite de date, parmi les commandes des boutiques (et du livreur `driverId`).
 * Renvoie { order (vue marchand ou brute pour le livreur), view } ou null.
 */
exports.findOrder = async ({ ref: r, loaded, shops, driverId }) => {
  const known = exports.resolveRefs([r], loaded).found[0];
  const ids = shops.map(s => s.id);
  let order = known;
  if (!order) {
    const ref = clean(r);
    const fullId = String(r || '')
      .replace(/^(n°|no|#)\s*/i, '')
      .trim();
    const exact = ref.length > 6 ? await repos.orders.getById(fullId).catch(() => null) : null;
    const candidates = exact ? [exact] : await repos.orders.findByIdSuffix(ids, ref);
    order = candidates.find(o => ids.includes(o.fastFoodId) && MERCHANT_STATUSES.includes(o.status) && (!driverId || o.driverId === driverId) && (exact || msg.ref(o) === ref));
    if (!order) return null;
  }
  if (driverId) {
    const { raw, views } = await driverViews([order], shops);
    return { order: raw[0], view: views[0] };
  }
  const { raw, views } = known ? { raw: [known], views: [viewOf(known, shops.find(s => s.id === known.fastFoodId)?.name)] } : await merchantViews([order], shops);
  return { order: raw[0], view: views[0] };
};

const clean = s =>
  String(s || '')
    .replace(/^(n°|no|#)\s*/i, '')
    .trim()
    .toUpperCase();

/**
 * Commandes désignées par des références (fin d'id de 6 caractères ou id complet), parmi
 * `orders`. Renvoie { found, missing }.
 */
exports.resolveRefs = (refs, orders) => {
  const found = [];
  const missing = [];
  for (const r of refs || []) {
    const ref = clean(r);
    const o = orders.find(x => String(x.id).toUpperCase() === ref || msg.ref(x) === ref);
    if (o) {
      if (!found.includes(o)) found.push(o);
    } else missing.push(String(r));
  }
  return { found, missing };
};

exports.ACTIVE = ACTIVE;
exports.viewOf = viewOf;
exports.when = when;
