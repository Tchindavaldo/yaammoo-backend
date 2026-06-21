// ============================================================================
// Transactions Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');
const { groupKey } = require('../../utils/period');

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

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.transaction.fromSupabase(data);
};

exports.getByUser = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).not('type', 'in', '("merchant_credit","withdrawal")').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.transaction.fromSupabase);
};

// ===== Portefeuille marchand (solde dérivé + historique) =====

/**
 * Solde du portefeuille marchand, CALCULÉ depuis les transactions :
 *   balance = Σ(merchant_credit.amount) − Σ(withdrawal.amount)
 * @returns {{ balance:number, totalEarned:number, totalWithdrawn:number }}
 */
exports.getMerchantBalance = async userId => {
  const { data, error } = await supabase.from(TABLE).select('type, amount').eq('user_id', userId).in('type', ['merchant_credit', 'withdrawal']);
  if (error) throw error;

  let totalEarned = 0;
  let totalWithdrawn = 0;
  for (const row of data || []) {
    const amt = Number(row.amount) || 0;
    if (row.type === 'merchant_credit') totalEarned += amt;
    else if (row.type === 'withdrawal') totalWithdrawn += amt;
  }
  return { balance: totalEarned - totalWithdrawn, totalEarned, totalWithdrawn };
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

  let query = supabase.from(TABLE).select('*').eq('user_id', userId).in('type', types);
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
  let query = supabase.from(TABLE).select('type, amount, created_at').eq('user_id', userId).in('type', ['merchant_credit', 'withdrawal']);
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
  const { balance } = await exports.getMerchantBalance(userId);

  return {
    groupBy,
    balance, // montant total actuel disponible du marchand (tout l'historique)
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
