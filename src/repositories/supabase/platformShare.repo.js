// ============================================================================
// Platform Share Repository — Supabase
// ============================================================================
// Part de la plateforme, PAR RÉSEAU (portefeuille pawaPay uniquement) :
//
//   marge[réseau]     = Σ order_settlements.platform_margin des commandes payées
//                       sur ce réseau, HORS commandes annulées (remboursées : la
//                       plateforme n'en garde rien)
//   fraisSms[réseau]  = Σ transactions `sms_fee` (coût Bird refacturé au marchand)
//   versé[réseau]     = Σ transactions `platform_transfer` (marge versée à une
//                       boutique par un admin)
//   part[réseau]      = marge + fraisSms − versé
//
//   dûAuxPortefeuilles[réseau] = Σ des soldes POSITIFS des portefeuilles
//                       (marchands, livreurs) : argent qui doit rester sur le
//                       compte pour leurs retraits. Un solde négatif (dette)
//                       n'est pas déduit : il n'est pas encore récupéré.
//
// Le réseau d'une commande est celui de son crédit marchand (`merchant_credit`,
// extra_data.relatedOrderId), comme dans platformTransfers.repo.
// ⚠️ Les retraits faits par l'admin directement sur pawaPay (hors app) ne sont
// pas connus ici : `part` est ce que la plateforme a GAGNÉ, pas ce qui reste.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { WALLET_AGGREGATORS } = require('../../utils/paymentAggregator');
const { toBalanceKey } = require('../../utils/mobileNetwork');

const PAGE = 1000; // plafond de lignes d'une réponse PostgREST
const CHUNK = 150; // taille des listes `in(...)`
const CANCELLED = ['cancelByUser', 'cancelByFastFood'];
const CREDIT_TYPES = ['merchant_credit', 'driver_credit', 'platform_transfer'];
const WALLET_TYPES = [...CREDIT_TYPES, 'withdrawal', 'merchant_debit', 'sms_fee'];

/** Toutes les lignes d'une requête, page par page (le plafond PostgREST tronquerait). */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

const chunks = list => {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

const zero = () => ({ mtn: 0, orange: 0 });

/** Marge des commandes non annulées, par réseau, + nombre de commandes annulées écartées. */
async function marginByNetwork() {
  const margin = zero();
  const settlements = await fetchAll(() => supabase.from('order_settlements').select('order_id, platform_margin').order('order_id'));
  if (!settlements.length) return { margin, excludedCancelled: 0 };
  const marginByOrder = new Map(settlements.map(s => [s.order_id, Number(s.platform_margin) || 0]));
  const ids = [...marginByOrder.keys()];

  const cancelled = new Set();
  const networkByOrder = new Map();
  for (const part of chunks(ids)) {
    const { data: orders, error } = await supabase.from('orders').select('id, status').in('id', part).in('status', CANCELLED);
    if (error) throw error;
    for (const o of orders || []) cancelled.add(o.id);
    const { data: credits, error: e2 } = await supabase.from('transactions').select('network, extra_data->>relatedOrderId').eq('type', 'merchant_credit').in('aggregator', WALLET_AGGREGATORS).in('extra_data->>relatedOrderId', part);
    if (e2) throw e2;
    for (const c of credits || []) {
      const key = toBalanceKey(c.network);
      if (key && !networkByOrder.has(c.relatedOrderId)) networkByOrder.set(c.relatedOrderId, key);
    }
  }
  for (const [orderId, key] of networkByOrder) {
    if (!cancelled.has(orderId)) margin[key] += marginByOrder.get(orderId) || 0;
  }
  return { margin, excludedCancelled: cancelled.size };
}

/** Somme d'un type de transaction portefeuille, par réseau. */
async function sumTypeByNetwork(type) {
  const out = zero();
  const rows = await fetchAll(() => supabase.from('transactions').select('amount, network').eq('type', type).in('aggregator', WALLET_AGGREGATORS).order('id'));
  for (const r of rows) {
    const key = toBalanceKey(r.network);
    if (key) out[key] += Number(r.amount) || 0;
  }
  return out;
}

/** Σ des soldes positifs des portefeuilles, par réseau. */
async function walletsOwedByNetwork() {
  const rows = await fetchAll(() => supabase.from('transactions').select('user_id, type, amount, network').in('type', WALLET_TYPES).in('aggregator', WALLET_AGGREGATORS).order('id'));
  const byUser = new Map();
  for (const r of rows) {
    const key = toBalanceKey(r.network);
    if (!key) continue;
    const bal = byUser.get(r.user_id) || zero();
    const amt = Number(r.amount) || 0;
    bal[key] += CREDIT_TYPES.includes(r.type) ? amt : -amt;
    byUser.set(r.user_id, bal);
  }
  const owed = zero();
  for (const bal of byUser.values()) {
    if (bal.mtn > 0) owed.mtn += bal.mtn;
    if (bal.orange > 0) owed.orange += bal.orange;
  }
  return owed;
}

exports.getPlatformShare = async () => {
  const [{ margin, excludedCancelled }, smsFees, transferred, walletsOwed] = await Promise.all([
    marginByNetwork(),
    sumTypeByNetwork('sms_fee'),
    sumTypeByNetwork('platform_transfer'),
    walletsOwedByNetwork(),
  ]);
  const byNetwork = {};
  for (const key of ['orange', 'mtn']) {
    byNetwork[key] = {
      margin: margin[key],
      smsFees: smsFees[key],
      transferred: transferred[key],
      share: margin[key] + smsFees[key] - transferred[key],
      walletsOwed: walletsOwed[key],
    };
  }
  const total = Object.values(byNetwork).reduce((a, n) => a + n.share, 0);
  return { byNetwork, total, excludedCancelledOrders: excludedCancelled };
};
