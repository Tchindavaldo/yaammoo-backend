// ============================================================================
// reorganize-storage — range les fichiers du vieux dossier `fastFood/`
// ============================================================================
// Deplace chaque fichier reference en base vers son dossier par type
// (cf. src/services/storage/storageFolders.js), puis reecrit l'URL en base :
//   fastfoods.image            -> shops/
//   menus.image / cover_image  -> menus/
//   menus.images[]             -> menus/
//   banners.image_url          -> banners/
//
// Par defaut : SIMULATION (rien n'est modifie, le plan est affiche).
//   node scripts/reorganize-storage.js           # simulation
//   node scripts/reorganize-storage.js --apply   # execution reelle
//
// Idempotent : une URL deja hors de `fastFood/` est ignoree ; relancer apres
// un echec reprend la ou il s'est arrete.
// ============================================================================
require('dotenv').config();
const { supabase } = require('../src/config/supabase');

const APPLY = process.argv.includes('--apply');
const BUCKET = process.env.SUPABASE_BUCKET || 'public';
const PUBLIC_BASE = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const LEGACY = 'fastFood/';

/** Chemin objet dans le bucket si l'URL est dans `fastFood/`, sinon null. */
function legacyKey(url) {
  if (typeof url !== 'string') return null;
  const clean = url.split('?')[0];
  if (!clean.startsWith(PUBLIC_BASE)) return null;
  const key = clean.slice(PUBLIC_BASE.length);
  return key.startsWith(LEGACY) ? key : null;
}

const moved = new Map(); // ancienne cle -> nouvelle URL (un fichier partage n'est deplace qu'une fois)
const stats = { moved: 0, rows: 0, missing: 0 };

/** Deplace le fichier et renvoie la nouvelle URL (ou l'ancienne si rien a faire). */
async function relocate(url, folder) {
  const key = legacyKey(url);
  if (!key) return url;
  if (moved.has(key)) return moved.get(key);
  const target = `${folder}/${key.slice(LEGACY.length)}`;
  const newUrl = PUBLIC_BASE + target;
  console.log(`  ${key}  ->  ${target}`);
  if (APPLY) {
    const { error } = await supabase.storage.from(BUCKET).move(key, target);
    if (error) {
      // Fichier deja absent du stockage : l'URL en base est morte, on n'y touche pas.
      console.warn(`  ! deplacement impossible (${error.message}) : URL laissee telle quelle`);
      stats.missing += 1;
      moved.set(key, url);
      return url;
    }
  }
  stats.moved += 1;
  moved.set(key, newUrl);
  return newUrl;
}

async function processTable(table, columns, folder, arrayColumns = []) {
  const { data, error } = await supabase.from(table).select(['id', ...columns, ...arrayColumns].join(','));
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`\n[${table}] ${data.length} lignes`);
  for (const row of data) {
    const patch = {};
    for (const col of columns) {
      const next = await relocate(row[col], folder);
      if (next !== row[col]) patch[col] = next;
    }
    for (const col of arrayColumns) {
      if (!Array.isArray(row[col])) continue;
      const next = [];
      for (const url of row[col]) next.push(await relocate(url, folder));
      if (next.some((u, i) => u !== row[col][i])) patch[col] = next;
    }
    if (!Object.keys(patch).length) continue;
    stats.rows += 1;
    if (APPLY) {
      const { error: upErr } = await supabase.from(table).update(patch).eq('id', row.id);
      if (upErr) throw new Error(`${table}#${row.id}: ${upErr.message}`);
    }
  }
}

/**
 * Commandes : `orders.menu` est une COPIE du plat au moment de l'achat (JSON).
 * Ses URLs d'images doivent suivre, sinon l'historique perd ses photos.
 */
async function processOrders() {
  const { data, error } = await supabase.from('orders').select('id, menu_snapshot');
  if (error) throw new Error(`orders: ${error.message}`);
  console.log(`\n[orders.menu_snapshot] ${data.length} lignes`);
  for (const row of data) {
    const menu = row.menu_snapshot;
    if (!menu || typeof menu !== 'object') continue;
    const next = { ...menu };
    for (const col of ['image', 'coverImage']) next[col] = await relocate(menu[col], 'menus');
    if (Array.isArray(menu.images)) {
      next.images = [];
      for (const url of menu.images) next.images.push(await relocate(url, 'menus'));
    }
    if (JSON.stringify(next) === JSON.stringify(menu)) continue;
    stats.rows += 1;
    if (APPLY) {
      const { error: upErr } = await supabase.from('orders').update({ menu_snapshot: next }).eq('id', row.id);
      if (upErr) throw new Error(`orders#${row.id}: ${upErr.message}`);
    }
  }
}

(async () => {
  console.log(APPLY ? 'MODE EXECUTION' : 'MODE SIMULATION (ajouter --apply pour executer)');
  await processTable('fastfoods', ['image'], 'shops');
  await processTable('menus', ['image', 'cover_image'], 'menus', ['images']);
  await processTable('banners', ['image_url'], 'banners');
  await processOrders();
  console.log(`\nFichiers deplaces: ${stats.moved} | lignes mises a jour: ${stats.rows} | introuvables: ${stats.missing}`);
})().catch(e => {
  console.error('ECHEC:', e.message);
  process.exit(1);
});
