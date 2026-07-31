// ============================================================================
// Bonus Flyer Downloads Repository — Supabase
// ============================================================================
// Trace le téléchargement du flyer d'un bonus `status_view` par un user : c'est
// `downloadedAt` (le PREMIER téléchargement du cycle) qui date le délai d'attente
// avant claim. Une ligne par (user, bonus) — index unique (migration 031).
//
// La ligne n'est JAMAIS supprimée (migration 032) : un claim la marque
// (`proofUploadedAt` + `proofVideoUrl`), un nouveau téléchargement la rouvre.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');

const TABLE = 'bonus_flyer_downloads';

const fromRow = row =>
  row
    ? {
        id: row.id,
        userId: row.user_id,
        bonusId: row.bonus_id,
        downloadedAt: row.downloaded_at,
        lastDownloadedAt: row.last_downloaded_at,
        downloadCount: row.download_count ?? 1,
        proofUploadedAt: row.proof_uploaded_at ?? null,
        proofVideoUrl: row.proof_video_url ?? null,
        createdAt: row.created_at,
      }
    : null;

exports.getByUserAndBonus = async (userId, bonusId) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).eq('bonus_id', bonusId).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/**
 * Tous les téléchargements d'un user, indexés par bonusId.
 * UNE requête pour toute la liste de bonus (le GET en enrichit N) : lire ligne à
 * ligne ferait un N+1.
 * @returns {Promise<Object<string, Object>>}
 */
exports.getByUserIndexed = async userId => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId);
  if (error) throw error;
  const index = {};
  for (const row of data || []) index[row.bonus_id] = fromRow(row);
  return index;
};

/**
 * Enregistre un téléchargement. `downloadedAt` est FIGÉ au premier : re-télécharger
 * ne remet pas le délai à zéro (et ne le rallonge pas non plus).
 *
 * ⚠️ Si la ligne portait déjà une preuve (cycle précédent réclamé), ce nouveau
 * téléchargement OUVRE un cycle : le marqueur est remis à zéro et `downloadedAt`
 * repart à maintenant. Sans ça, le user ne pourrait plus jamais réclamer — la
 * ligne n'étant plus supprimée, son ancien marqueur le bloquerait à vie.
 * @returns {Promise<Object>} la ligne à jour
 */
exports.record = async (userId, bonusId) => {
  const existing = await exports.getByUserAndBonus(userId, bonusId);
  const now = new Date().toISOString();

  if (existing) {
    const newCycle = !!existing.proofUploadedAt;
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        last_downloaded_at: now,
        download_count: newCycle ? 1 : (existing.downloadCount || 1) + 1,
        ...(newCycle ? { downloaded_at: now, proof_uploaded_at: null, proof_video_url: null } : {}),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id: generateId(),
      user_id: userId,
      bonus_id: bonusId,
      downloaded_at: now,
      last_downloaded_at: now,
      download_count: 1,
      created_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
};

/**
 * Marque le téléchargement comme ayant servi à une réclamation (migration 032).
 * Remplace l'ancienne purge : la ligne SURVIT, ce qui garde la trace de ce que le
 * user a téléchargé et de la preuve envoyée. Le cycle suivant se rouvre au
 * prochain `record()`.
 *
 * Pour rouvrir l'upload manuellement (test) :
 *   UPDATE bonus_flyer_downloads SET proof_uploaded_at = NULL WHERE …
 */
exports.markProofUploaded = async (userId, bonusId, proofVideoUrl = null) => {
  const { error } = await supabase
    .from(TABLE)
    .update({ proof_uploaded_at: new Date().toISOString(), proof_video_url: proofVideoUrl })
    .eq('user_id', userId)
    .eq('bonus_id', bonusId);
  if (error) throw error;
};
