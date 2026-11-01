// ============================================================================
// Transactions Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');
const { groupKey } = require('../../utils/period');
const { WALLET_AGGREGATORS } = require('../../utils/paymentAggregator');
const { toBalanceKey } = require('../../utils/mobileNetwork');

const TABLE = 'transactions';

exports.create = async data => {
  const id = data.id || generateId();
  const payload = m.transaction.toSupabase({
    ...data,
    id,
    createdAt: data.createdAt || new Date().toISOString(),
  });
  const { data: row, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return m.transaction.fromSupabase(row);
};

/**
 * Course déjà versée pour cette commande, ou null. Garde-fou d'idempotence :
 * une transition `delivered` rejouée ne doit pas payer le livreur deux fois.
 */
exports.findDriverCredit = async orderId => {
  if (!orderId) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('type', 'driver_credit').contains('extra_data', { relatedOrderId: orderId }).maybeSingle();
  if (error) throw error;
  return m.transaction.fromSupabase(data);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.transaction.fromSupabase(data);
};

exports.getByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).not('type', 'in', '("merchant_credit","driver_credit","withdrawal")').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.transaction.fromSupabase);
};

/**
 * Crédit marchand d'une commande, ou null : sert à retrouver l'agrégateur et
 * le réseau qui ont encaissé l'argent (la course livreur est versée plus tard,
 * à la livraison, sur le même solde).
 * @returns {Promise<{aggregator:string|null, network:string|null, mwTransactionId:string|null}|null>}
 */
exports.findMerchantCreditByOrder = async orderId => {
  if (!orderId) return null;
  const { data, error } = await supabase.from(TABLE).select('aggregator, network, mw_transaction_id').eq('type', 'merchant_credit').contains('extra_data', { relatedOrderId: orderId }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { aggregator: data.aggregator ?? null, network: data.network ?? null, mwTransactionId: data.mw_transaction_id ?? null } : null;
};

// ===== Portefeuille marchand (solde dérivé + historique) =====

const WALLET_TYPES = ['merchant_credit', 'driver_credit', 'withdrawal'];
const isCredit = type => type === 'merchant_credit' || type === 'driver_credit';

/**
 * Solde du portefeuille, CALCULÉ depuis les transactions, PAR RÉSEAU :
 *   solde[réseau] = Σ(crédits sur ce réseau) − Σ(retraits débités de ce réseau)
 *   balance       = mtn + orange
 *
 * ⚠️ Seuls les agrégateurs du portefeuille (`WALLET_AGGREGATORS`, pawaPay)
 * comptent. L'historique DigiKUNTZ reste en base mais n'est ni affiché ni
 * retirable.
 *
 * @returns {{ balance:number, totalEarned:number, totalWithdrawn:number, mtn:number, orange:number }}
 */
exports.getMerchantBalance = async userId => {
  // `driver_credit` compte comme un gain : le portefeuille d'un livreur suit la
  // même mécanique que celui d'un marchand (crédits − retraits).
  const { data, error } = await supabase.from(TABLE).select('type, amount, network, extra_data').eq('user_id', userId).in('type', WALLET_TYPES).in('aggregator', WALLET_AGGREGATORS);
  if (error) throw error;

  const byNetwork = { mtn: 0, orange: 0 };
  // Découpage de chaque solde : commandes (plats + courses) / réserve de frais
  // de retrait kiosque. Crédit : `extra_data.kioskFee` va aux frais. Retrait :
  // `extra_data.feesDebit` sort des frais, le reste des commandes.
  const parts = { mtn: { orders: 0, fees: 0 }, orange: { orders: 0, fees: 0 } };
  let totalEarned = 0;
  let totalWithdrawn = 0;
  for (const row of data || []) {
    const amt = Number(row.amount) || 0;
    const key = toBalanceKey(row.network);
    if (!key) {
      console.error(`[transactions.repo] ⚠️ ligne wallet sans réseau (userId=${userId}, type=${row.type}, amount=${amt}) → ignorée du solde`);
      continue;
    }
    const extra = row.extra_data || {};
    if (isCredit(row.type)) {
      totalEarned += amt;
      byNetwork[key] += amt;
      const fees = Math.min(amt, Math.max(0, Number(extra.kioskFee) || 0));
      parts[key].fees += fees;
      parts[key].orders += amt - fees;
    } else {
      totalWithdrawn += amt;
      byNetwork[key] -= amt;
      const fees = Math.min(amt, Math.max(0, Number(extra.feesDebit) || 0));
      parts[key].fees -= fees;
      parts[key].orders -= amt - fees;
    }
  }
  const breakdown = {
    mtn: { orders: parts.mtn.orders, fees: parts.mtn.fees, total: byNetwork.mtn },
    orange: { orders: parts.orange.orders, fees: parts.orange.fees, total: byNetwork.orange },
  };
  return { balance: byNetwork.mtn + byNetwork.orange, totalEarned, totalWithdrawn, mtn: byNetwork.mtn, orange: byNetwork.orange, breakdown };
};

// payin  = gain marchand (merchant_credit) ; payout = retrait (withdrawal)
const TYPE_BY_DIRECTION = { payin: 'merchant_credit', payout: 'withdrawal' };
const directionOf = type => (type === 'withdrawal' ? 'payout' : 'payin');

/**
 * Historique du portefeuille marchand : crédits (payin) + retraits (payout).
 * Chaque entrée est annotée d'un champ `direction`. Triée DESC.
 * @param {string} userId
 * @param {{ direction?:'payin'|'payout', from?:string|null, to?:string|null }} opts
 */
exports.getMerchantHistory = async (userId, { direction, from, to } = {}) => {
  const types = TYPE_BY_DIRECTION[direction] ? [TYPE_BY_DIRECTION[direction]] : ['merchant_credit', 'withdrawal'];

  let query = supabase.from(TABLE).select('*').eq('user_id', userId).in('type', types).in('aggregator', WALLET_AGGREGATORS);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(row => ({
    ...m.transaction.fromSupabase(row),
    direction: directionOf(row.type),
  }));
};

/**
 * Totaux agrégés payin/payout/net groupés par période, + solde actuel du marchand.
 * - `totals`  : agrégats SUR LA PÉRIODE filtrée (count = nb total de transactions).
 * - `series`  : un bucket par jour/semaine/mois.
 * - `balance` : solde ACTUEL du marchand (tout l'historique, indépendant de la période).
 * @param {string} userId
 * @param {{ groupBy?:'day'|'week'|'month', from?:string|null, to?:string|null }} opts
 */
exports.getMerchantStats = async (userId, { groupBy = 'day', from, to } = {}) => {
  let query = supabase.from(TABLE).select('type, amount, created_at').eq('user_id', userId).in('type', ['merchant_credit', 'withdrawal']).in('aggregator', WALLET_AGGREGATORS);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) throw error;

  const buckets = new Map();
  let totalPayin = 0;
  let totalPayout = 0;

  for (const row of data || []) {
    const amt = Number(row.amount) || 0;
    const isPayin = row.type === 'merchant_credit';
    if (isPayin) totalPayin += amt;
    else totalPayout += amt;

    const key = groupKey(row.created_at, groupBy);
    if (!buckets.has(key)) buckets.set(key, { period: key, payin: 0, payout: 0, net: 0, count: 0 });
    const b = buckets.get(key);
    if (isPayin) b.payin += amt;
    else b.payout += amt;
    b.net = b.payin - b.payout;
    b.count += 1;
  }

  const series = [...buckets.values()].sort((a, b) => (a.period < b.period ? 1 : -1));

  // Solde actuel = tout l'historique (pas seulement la période demandée)
  const { balance, mtn, orange, breakdown } = await exports.getMerchantBalance(userId);

  return {
    groupBy,
    balance, // montant total actuel disponible du marchand (tout l'historique)
    balances: { mtn, orange }, // les deux soldes (ajout R11, purement additif)
    breakdown, // { mtn|orange: { orders, fees, total } } (ajout additif)
    totals: { payin: totalPayin, payout: totalPayout, net: totalPayin - totalPayout },
    series, // un bucket par jour/semaine/mois : { period, payin, payout, net, count }
  };
};

// ===== Idempotence (Webhook + Socket) =====

/**
 * Réserve le règlement d'une transaction (atomique).
 * Retourne true si cette entrée a été créée (c'est le premier chemin).
 * Retourne false si déjà présent (l'autre chemin a déjà traité).
 * Idempotent: ne crée qu'UNE FOIS même si appelé 2 fois.
 */
exports.reserveSettlement = async (transactionId, settledBy, status) => {
  const { data, error } = await supabase.from('transaction_settlements').insert({ transaction_id: transactionId, settled_by: settledBy, status }).select().single();

  // Succès = insertion réussie = c'est le premier chemin
  if (!error) return true;

  // Erreur 23505 = UNIQUE violation (déjà existe)
  // → l'autre chemin a déjà traité, skip
  if (error.code === '23505') {
    return false;
  }

  // Autre erreur → lance l'exception
  throw error;
};

/**
 * Récupère le statut de règlement d'une transaction.
 * Retourne { settled_by, status, settled_at } ou null si pas encore réglée.
 */
exports.getSettlement = async transactionId => {
  const { data, error } = await supabase.from('transaction_settlements').select('settled_by, status, settled_at').eq('transaction_id', transactionId).maybeSingle();

  if (error) throw error;
  return data;
};
