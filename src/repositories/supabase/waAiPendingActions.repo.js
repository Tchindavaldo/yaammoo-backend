// ============================================================================
// WA AI pending actions Repository — Supabase (migration 090)
// Actions proposées par l'agent IA (accepter, refuser, avancer un statut), en
// attente de la confirmation du marchand.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'wa_ai_pending_actions';

exports.create = async action => {
  const row = m.waPendingAction.toSupabase({ ...action, id: action.id || generateId() });
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return m.waPendingAction.fromSupabase(data);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.waPendingAction.fromSupabase(data);
};

/** Actions encore ouvertes d'un numéro, plus récentes d'abord. */
exports.openByPhone = async phone => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('phone', phone).eq('status', 'open').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.waPendingAction.fromSupabase);
};

/**
 * Clôt une action SEULEMENT si elle est encore ouverte (un double clic, ou un clic
 * plus un « oui » écrit, ne l'exécute qu'une fois). Renvoie l'action close ou null.
 */
exports.resolveIfOpen = async (id, status, result = null) => {
  const { data, error } = await supabase.from(TABLE).update({ status, result, resolved_at: new Date().toISOString() }).eq('id', id).eq('status', 'open').select();
  if (error) throw error;
  return data?.length ? m.waPendingAction.fromSupabase(data[0]) : null;
};

/** Note le résultat d'une action déjà close. */
exports.setResult = async (id, result) => {
  const { error } = await supabase.from(TABLE).update({ result }).eq('id', id);
  if (error) throw error;
};

/** Expire les actions ouvertes créées avant `beforeIso`, efface les closes plus anciennes que `purgeBeforeIso`. */
exports.expireAndPurge = async (beforeIso, purgeBeforeIso) => {
  const { error: e1 } = await supabase.from(TABLE).update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('status', 'open').lt('created_at', beforeIso);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from(TABLE).delete().lt('created_at', purgeBeforeIso);
  if (e2) throw e2;
};
