// ============================================================================
// imageTrash Repository — Supabase (migration 071)
// ============================================================================
// Corbeille d'images : une ligne par fichier en attente d'effacement.
// En attente = restored_at ET purged_at nuls.
// ============================================================================
const { supabase } = require('../../config/supabase');
const { generateId } = require('../idGen');

const TABLE = 'image_trash';

const fromRow = r =>
  r && {
    id: r.id,
    url: r.url,
    entity: r.entity,
    entityId: r.entity_id,
    field: r.field,
    trashedAt: r.trashed_at,
    restoredAt: r.restored_at,
    purgedAt: r.purged_at,
  };

/** Met des URL en corbeille. `items` : [{ url, entity, entityId, field }]. */
exports.addMany = async items => {
  if (!items.length) return [];
  const rows = items.map(i => ({ id: generateId(), url: i.url, entity: i.entity || null, entity_id: i.entityId || null, field: i.field || null }));
  const { data, error } = await supabase.from(TABLE).insert(rows).select();
  if (error) throw error;
  return data.map(fromRow);
};

exports.getById = async id => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return fromRow(data);
};

/** Images en attente, plus récentes d'abord. */
exports.listPending = async ({ limit = 200 } = {}) => {
  const { data, error } = await supabase.from(TABLE).select('*').is('restored_at', null).is('purged_at', null).order('trashed_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map(fromRow);
};

/** Images en attente mises en corbeille avant `before` (ISO). */
exports.listExpired = async before => {
  const { data, error } = await supabase.from(TABLE).select('*').is('restored_at', null).is('purged_at', null).lt('trashed_at', before).limit(500);
  if (error) throw error;
  return data.map(fromRow);
};

/** Une même URL restaurée ou réutilisée ne doit plus être effacée. */
exports.markRestoredByUrl = async url => {
  const { error } = await supabase.from(TABLE).update({ restored_at: new Date().toISOString() }).eq('url', url).is('restored_at', null).is('purged_at', null);
  if (error) throw error;
};

exports.markPurged = async id => {
  const { error } = await supabase.from(TABLE).update({ purged_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};
