// ============================================================================
// imageTrash.service — Corbeille d'images (migration 071)
// ============================================================================
// `purgeUnusedImages` met en corbeille ; ce service liste, restaure (admin) et
// efface du storage les images dont le délai `image_trash_retention_days`
// (settings_deployment, 60 j par défaut) est écoulé. L'effacement tourne dans
// le job de purge des boutiques (`utils/fastfoodPurgeJob.js`).
// ============================================================================
const repos = require('../../repositories');
const { deleteImageFromSupabase, purgeUnusedImages } = require('./uploadImage.service');
const { getImageTrashRetentionDays } = require('../settings/settings.service');

const ENTITY_REPO = { menu: 'menus', fastfood: 'fastfoods', banner: 'banners', bonus: 'bonus' };

exports.listImageTrash = async () => {
  const [items, retentionDays] = await Promise.all([repos.imageTrash.listPending(), getImageTrashRetentionDays()]);
  return {
    retentionDays,
    items: items.map(i => ({ ...i, purgeAt: new Date(new Date(i.trashedAt).getTime() + retentionDays * 86400000).toISOString() })),
  };
};

/**
 * Restaure une image : la remet dans le champ d'origine si la ligne existe
 * encore (galerie `images` : ajoutée à la fin), puis l'image n'est plus
 * effacée. Ligne d'origine disparue ou inconnue : le fichier est seulement
 * conservé (`reattached: false`), l'admin peut réutiliser l'URL.
 */
exports.restoreImage = async id => {
  const item = await repos.imageTrash.getById(id);
  if (!item) return { status: 404, message: 'Image introuvable dans la corbeille.' };
  if (item.purgedAt) return { status: 409, message: 'Image déjà effacée du storage.' };
  if (item.restoredAt) return { status: 409, message: 'Image déjà restaurée.' };

  let reattached = false;
  const repo = repos[ENTITY_REPO[item.entity]];
  if (repo && item.entityId && item.field) {
    const row = await repo.getById(item.entityId);
    if (row) {
      const value = item.field === 'images' ? [...(row.images || []).filter(u => u !== item.url), item.url] : item.url;
      await repo.update(item.entityId, { [item.field]: value });
      // L'image qu'elle remplace part à son tour en corbeille.
      if (item.field !== 'images') await purgeUnusedImages([row[item.field]], [item.url], { entity: item.entity, entityId: item.entityId, field: item.field });
      reattached = true;
    }
  }
  await repos.imageTrash.markRestoredByUrl(item.url);
  return { status: 200, data: { ...item, reattached } };
};

/** Efface du storage les images expirées. Ne lève jamais. */
exports.purgeImageTrash = async () => {
  const retentionDays = await getImageTrashRetentionDays();
  const before = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const expired = await repos.imageTrash.listExpired(before);
  let deleted = 0;
  const errors = [];
  for (const item of expired) {
    try {
      await deleteImageFromSupabase(item.url);
      await repos.imageTrash.markPurged(item.id);
      deleted++;
    } catch (error) {
      errors.push({ url: item.url, reason: error.message });
    }
  }
  return { deleted, errors };
};
