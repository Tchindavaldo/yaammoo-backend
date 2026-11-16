// Commandes vues par l'agent IA WhatsApp : celles des boutiques du numéro, des N derniers
// jours, en VUE MARCHAND (`toMerchantView` : `total` = ce que le marchand encaisse, jamais
// le prix client ni la marge). Résolution des références écrites par le marchand
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

/** Commande -> objet lu par le modèle (aucune donnée personnelle du client). */
const viewOf = (o, shopName) => ({
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
});

/**
 * Commandes des boutiques depuis `days` jours, vue marchand, plus récentes d'abord.
 * @returns {Promise<{ raw: object[], views: object[] }>} raw = commandes (vue marchand), views = pour le modèle
 */
exports.loadShopOrders = async (shops, days) => {
  const { toMerchantView } = require('../../order/toMerchantView');
  const createdAfter = new Date(Date.now() - days * 864e5).toISOString();
  const raw = [];
  const views = [];
  for (const shop of shops) {
    const orders = await repos.orders.query({ fastFoodId: shop.id, status: MERCHANT_STATUSES, createdAfter });
    const merchant = orders.length ? await toMerchantView(orders) : [];
    for (const o of merchant) {
      raw.push(o);
      views.push(viewOf(o, shop.name));
    }
  }
  return { raw, views };
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
