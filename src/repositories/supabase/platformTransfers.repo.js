// ============================================================================
// Platform Transfers Repository — Supabase
// ============================================================================
// Marge plateforme d'une boutique, PAR RÉSEAU, et transferts admin déjà
// prélevés dessus (transactions `type='platform_transfer'`).
//
//   marge gagnée[réseau]   = Σ order_settlements.platform_margin des commandes
//                            de la boutique payées sur ce réseau (portefeuille)
//   déjà transférée[réseau] = Σ platform_transfer dont la SOURCE est la boutique
//   disponible             = gagnée − transférée
//
// Le réseau d'une commande est celui du paiement, relu sur son crédit marchand
// (`merchant_credit`, extra_data.relatedOrderId) : `order_settlements` ne le
// porte pas. Seuls les agrégateurs du portefeuille comptent (pawaPay).
//
// ⚠️ `order_deliveries.platform_margin` n'est PAS ajouté : c'est le détail de
// la course, déjà compris dans le résidu `order_settlements.platform_margin`.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');
const { WALLET_AGGREGATORS } = require('../../utils/paymentAggregator');
const { toBalanceKey } = require('../../utils/mobileNetwork');

const TYPE = 'platform_transfer';
const CHUNK = 150; // taille des listes `in(...)` envoyées à PostgREST

const chunks = list => {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

/** Marge gagnée par réseau : `{ mtn, orange }` (FCFA). */
exports.getEarnedMarginByNetwork = async fastFoodId => {
  const earned = { mtn: 0, orange: 0 };
  const { data: settlements, error } = await supabase.from('order_settlements').select('order_id, platform_margin').eq('fastfood_id', fastFoodId);
  if (error) throw error;
  if (!settlements?.length) return earned;

  const marginByOrder = new Map(settlements.map(s => [s.order_id, Number(s.platform_margin) || 0]));
  // Une commande = un crédit marchand ; on dédoublonne par sécurité.
  const networkByOrder = new Map();
  for (const ids of chunks([...marginByOrder.keys()])) {
    const { data: credits, error: e2 } = await supabase.from('transactions').select('network, extra_data->>relatedOrderId').eq('type', 'merchant_credit').in('aggregator', WALLET_AGGREGATORS).in('extra_data->>relatedOrderId', ids);
    if (e2) throw e2;
    for (const c of credits || []) {
      const key = toBalanceKey(c.network);
      if (key && !networkByOrder.has(c.relatedOrderId)) networkByOrder.set(c.relatedOrderId, key);
    }
  }
  for (const [orderId, key] of networkByOrder) earned[key] += marginByOrder.get(orderId) || 0;
  return earned;
};

/** Marge déjà transférée depuis cette boutique, par réseau : `{ mtn, orange }`. */
exports.getTransferredByNetwork = async fastFoodId => {
  const out = { mtn: 0, orange: 0 };
  const { data, error } = await supabase.from('transactions').select('amount, network').eq('type', TYPE).contains('extra_data', { sourceFastFoodId: fastFoodId });
  if (error) throw error;
  for (const row of data || []) {
    const key = toBalanceKey(row.network);
    if (key) out[key] += Number(row.amount) || 0;
  }
  return out;
};

/**
 * Enregistre les transferts en UNE insertion (tout ou rien).
 * @param {Array<Object>} rows transactions au format métier (camelCase)
 */
exports.createMany = async rows => {
  const now = new Date().toISOString();
  const payload = rows.map(r => m.transaction.toSupabase({ ...r, type: TYPE, id: r.id || generateId(), createdAt: now }));
  const { data, error } = await supabase.from('transactions').insert(payload).select();
  if (error) throw error;
  return (data || []).map(m.transaction.fromSupabase);
};
