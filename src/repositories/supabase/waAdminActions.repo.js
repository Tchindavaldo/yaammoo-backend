// ============================================================================
// WA admin actions Repository — Supabase (migration 098)
// Actions proposées par l'agent IA admin, exécutées après la confirmation de
// l'administrateur (bouton Confirmer ou réponse écrite).
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'wa_admin_actions';

exports.create = async action => {
  const row = m.waAdminAction.toSupabase({ ...action, id: action.id || generateId() });
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return m.waAdminAction.fromSupabase(data);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.waAdminAction.fromSupabase(data);
};

/** Actions encore ouvertes d'un administrateur, plus récentes d'abord. */
exports.openByPhone = async phone => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('phone', phone).eq('status', 'open').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m.waAdminAction.fromSupabase);
};

/** Clôt une action SEULEMENT si elle est encore ouverte (double confirmation = une exécution). */
exports.resolveIfOpen = async (id, status) => {
  const { data, error } = await supabase.from(TABLE).update({ status, resolved_at: new Date().toISOString() }).eq('id', id).eq('status', 'open').select();
  if (error) throw error;
  return data?.length ? m.waAdminAction.fromSupabase(data[0]) : null;
};

/** Note le résultat d'une action déjà close. */
exports.setResult = async (id, result) => {
  const { error } = await supabase.from(TABLE).update({ result }).eq('id', id);
  if (error) throw error;
};

/** Expire les actions ouvertes créées avant `beforeIso`, efface les plus anciennes que `purgeBeforeIso`. */
exports.expireAndPurge = async (beforeIso, purgeBeforeIso) => {
  const { error: e1 } = await supabase.from(TABLE).update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('status', 'open').lt('created_at', beforeIso);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from(TABLE).delete().lt('created_at', purgeBeforeIso);
  if (e2) throw e2;
};
