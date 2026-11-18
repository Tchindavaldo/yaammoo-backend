// ============================================================================
// WA admin alerts Repository — Supabase (migration 098)
// Alertes envoyées aux super-administrateurs sur WhatsApp (agent d'une boutique ou d'un
// livreur bloqué, message au support de la plateforme).
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');
const m = require('../mappers');

const TABLE = 'wa_admin_alerts';

exports.create = async alert => {
  const row = m.waAdminAlert.toSupabase({ ...alert, id: alert.id || generateId() });
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return m.waAdminAlert.fromSupabase(data);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return m.waAdminAlert.fromSupabase(data);
};

/** Alertes ouvertes, plus récentes d'abord. */
exports.listOpen = async (limit = 20) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(m.waAdminAlert.fromSupabase);
};

/** Ferme une alerte (traitée). */
exports.close = async id => {
  const { error } = await supabase.from(TABLE).update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

/** Efface les alertes plus anciennes que `beforeIso`. */
exports.purgeBefore = async beforeIso => {
  const { error } = await supabase.from(TABLE).delete().lt('created_at', beforeIso);
  if (error) throw error;
};
