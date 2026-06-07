// ============================================================================
// Transactions Repository — Supabase
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'transactions';

exports.create = async (data) => {
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

exports.getById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.transaction.fromSupabase(data);
};

exports.getByUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.transaction.fromSupabase);
};

// ===== Idempotence (Webhook + Socket) =====

/**
 * Réserve le règlement d'une transaction (atomique).
 * Retourne true si cette entrée a été créée (c'est le premier chemin).
 * Retourne false si déjà présent (l'autre chemin a déjà traité).
 * Idempotent: ne crée qu'UNE FOIS même si appelé 2 fois.
 */
exports.reserveSettlement = async (transactionId, settledBy, status) => {
  const { data, error } = await supabase
    .from('transaction_settlements')
    .insert({ transaction_id: transactionId, settled_by: settledBy, status })
    .select()
    .single();

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
exports.getSettlement = async (transactionId) => {
  const { data, error } = await supabase
    .from('transaction_settlements')
    .select('settled_by, status, settled_at')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (error) throw error;
  return data;
};
