// ============================================================================
// WA number claims Repository — Supabase (migration 093)
// Liens de validation SANS code d'un numéro OM / MoMo par WhatsApp : le message
// « NUMERO <jeton> » reçu DU numéro prouve qu'on le détient.
// ============================================================================
const crypto = require('crypto');
const { supabase } = require('../../config/supabase');
const m = require('../mappers');

const TABLE = 'wa_number_claims';

/** Crée un lien valable `ttlMinutes` pour (userId, phone E.164). */
exports.create = async ({ userId, phone, ttlMinutes }) => {
  const token = crypto.randomBytes(6).toString('base64url').toUpperCase();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60e3).toISOString();
  const { data, error } = await supabase.from(TABLE).insert({ token, user_id: userId, phone, expires_at: expiresAt }).select().single();
  if (error) throw error;
  return m.waNumberClaim.fromSupabase(data);
};

exports.getByToken = async token => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  return m.waNumberClaim.fromSupabase(data);
};

/** Marque le lien utilisé s'il ne l'est pas déjà. Renvoie false si un autre message l'a pris. */
exports.markUsed = async token => {
  const { data, error } = await supabase.from(TABLE).update({ used_at: new Date().toISOString() }).eq('token', token).is('used_at', null).select('token');
  if (error) throw error;
  return (data || []).length > 0;
};

/** Efface les liens expirés depuis plus d'un jour (purge horaire de l'agent IA). */
exports.purgeExpired = async () => {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .lt('expires_at', new Date(Date.now() - 864e5).toISOString());
  if (error) throw error;
};
