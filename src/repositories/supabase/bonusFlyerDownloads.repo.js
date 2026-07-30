// ============================================================================
// Bonus Flyer Downloads Repository — Supabase
// ============================================================================
// Trace le téléchargement du flyer d'un bonus `status_view` par un user : c'est
// `downloadedAt` (le PREMIER téléchargement du cycle) qui date le délai d'attente
// avant claim. Une ligne par (user, bonus) — index unique (migration 031).
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
        createdAt: row.created_at,
      }
    : null;

exports.getByUserAndBonus = async (userId, bonusId) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).eq('bonus_id', bonusId).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/**
 * Enregistre un téléchargement. `downloadedAt` est FIGÉ au premier : re-télécharger
 * ne remet pas le délai à zéro (et ne le rallonge pas non plus).
 * @returns {Promise<Object>} la ligne à jour
 */
exports.record = async (userId, bonusId) => {
  const existing = await exports.getByUserAndBonus(userId, bonusId);
  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ last_downloaded_at: now, download_count: (existing.downloadCount || 1) + 1 })
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

/** Purge le téléchargement après une réclamation : le cycle suivant en exige un neuf. */
exports.clear = async (userId, bonusId) => {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('bonus_id', bonusId);
  if (error) throw error;
};
