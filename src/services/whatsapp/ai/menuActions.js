// Exécution des propositions de l'agent IA sur les plats d'une boutique WhatsApp, après
// confirmation du marchand (pendingActions.execute, migration 097) : disponibilité
// (menu_availability) et création (menu_create, image provisoire en attendant la photo).
// Passe par les services menus existants (contrôle des prix, sockets, paniers recalculés),
// puis renvoie la liste à jour. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { getAiSettings } = require('../../settings/settings.service');
const { sendText } = require('../merchantChannel');
const { sendMenuList } = require('../menu/dailyMenu.service');

/**
 * Image des plats créés par l'agent : `ai_default_menu_image_url`, sinon celle du backend.
 * Jamais une image du storage du projet : la corbeille l'effacerait au premier remplacement
 * par une photo (purgeUnusedImages), et tous les plats qui la partagent la perdraient.
 */
exports.defaultMenuImage = async () => {
  const { defaultMenuImageUrl } = await getAiSettings();
  const storage = process.env.SUPABASE_URL;
  if (defaultMenuImageUrl && !(storage && defaultMenuImageUrl.startsWith(storage))) return defaultMenuImageUrl;
  if (defaultMenuImageUrl) console.warn('⚠️ [AI] ai_default_menu_image_url pointe vers le storage du projet : ignorée');
  return `${process.env.BACKEND_URL}/assets/menu-default.png`;
};

/** Plats rendus disponibles ou indisponibles (status ; stock du jour si donné). */
const applyAvailability = async (pending, fastFood) => {
  const { updateMenuService } = require('../../menu/updateMenu.service');
  const lines = [];
  for (const c of pending.payload.changes || []) {
    const menu = await repos.menus.getById(c.menuId);
    if (!menu || menu.fastFoodId !== fastFood.id) {
      lines.push(`${c.name} : plat introuvable.`);
      continue;
    }
    const data = c.disponible ? { status: 'available', ...(Number.isInteger(c.stock) ? { stock: c.stock } : {}) } : { status: 'unavailable' };
    const r = await updateMenuService(menu.id, data);
    if (!r.success) lines.push(`${c.name} : ${r.message}`);
    else lines.push(`${c.name} : ${c.disponible ? `disponible${Number.isInteger(c.stock) ? ` (stock ${c.stock})` : ''}` : 'indisponible'}.`);
  }
  return lines;
};

/** Plats créés avec l'image provisoire ; renvoie aussi les noms créés (photos à demander). */
const applyCreate = async (pending, fastFood) => {
  const { postMenuService } = require('../../menu/postMenu.service');
  const image = await exports.defaultMenuImage();
  const lines = [];
  const created = [];
  for (const d of pending.payload.plats || []) {
    const r = await postMenuService({
      fastFoodId: fastFood.id,
      name: d.nom,
      ...(d.categorie ? { category: d.categorie } : {}),
      prices: d.prix.map(p => ({ price: p.prix, ...(p.description ? { description: p.description } : {}) })),
      stock: d.stock,
      status: 'available',
      coverImage: image,
      coverImageHasBackground: true,
      images: [image, image, image],
    });
    if (r.success) created.push(d.nom);
    lines.push(r.success ? `${d.nom} : ajouté.` : `${d.nom} : ${r.message}`);
  }
  return { lines, created };
};

/** Applique la proposition confirmée, envoie le compte rendu et la liste à jour. Renvoie le compte rendu. */
exports.apply = async (pending, fastFood, to) => {
  let lines;
  let created = [];
  if (pending.action === 'menu_availability') lines = await applyAvailability(pending, fastFood);
  else ({ lines, created } = await applyCreate(pending, fastFood));
  if (lines.length) await sendText(to, lines.join('\n'), 'ai');
  await sendMenuList(fastFood, to);
  // Photos : une à la fois, en citant le plat (l'agent prend la suite à la réception).
  if (created.length) {
    await sendText(to, `Ces plats ont une image provisoire. Envoyez maintenant la photo du plat « ${created[0]} » (une photo par message, un plat à la fois).`, 'ai');
  }
  return lines.join(' ') || 'Aucun plat modifié.';
};
