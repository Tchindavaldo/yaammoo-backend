// ============================================================================
// Legal Repository — Supabase (migration 077)
// ============================================================================
// `legal_documents` : versions du texte (CGU + confidentialité).
// `legal_acceptances` : preuve d'acceptation par utilisateur et par version.
// ============================================================================
const { supabase } = require('../../config/supabase');

const docFromRow = r =>
  r ? { version: r.version, title: r.title, content: r.content, requiresAcceptance: !!r.requires_acceptance, publishedAt: r.published_at } : null;

/** Dernière version publiée (texte complet). */
exports.getLatest = async () => {
  const { data, error } = await supabase.from('legal_documents').select('*').order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return docFromRow(data);
};

/** Dernière version qui exige une nouvelle acceptation (numéro), ou null. */
exports.getLatestRequiredVersion = async () => {
  const { data, error } = await supabase.from('legal_documents').select('version').eq('requires_acceptance', true).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.version ?? null;
};

/** Dernière acceptation de l'utilisateur, ou null. */
exports.getLastAcceptance = async userId => {
  const { data, error } = await supabase.from('legal_acceptances').select('version, accepted_at').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { version: data.version, acceptedAt: data.accepted_at } : null;
};

/** Enregistre l'acceptation (idempotent : une ligne par utilisateur et version). */
exports.accept = async ({ userId, version, appVersion }) => {
  const { error } = await supabase.from('legal_acceptances').upsert({ user_id: userId, version, app_version: appVersion ?? null }, { onConflict: 'user_id,version', ignoreDuplicates: true });
  if (error) throw error;
  return exports.getLastAcceptance(userId);
};
