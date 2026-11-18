// Outils de l'agent IA du MARCHAND WhatsApp sur les plats (migration 097) : liste avec les
// prix de la boutique, liste envoyée au marchand, disponibilité et création (propositions
// avec boutons Confirmer / Annuler, exécutées par menuActions.js), photo d'un plat (tout de
// suite : photo envoyée par le marchand lui-même), notification push à ses clients
// (proposition, quota du forfait, shopPushActions.js). `ctx` = { phone, shops, flags }.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const pendingActions = require('./pendingActions.service');
const { fn } = require('./agentLoop');
const { sendMenuList } = require('../menu/dailyMenu.service');
const { defaultMenuImage } = require('./menuActions');
const { imagesIn } = require('./merchantImages');

const boutique = { type: 'string', description: 'Nom de la boutique, seulement si le numéro en pilote plusieurs' };
const plat = { type: 'string', description: 'id (de list_menus) ou nom exact du plat' };
const isAvailable = m => require('../../fastfood/getFastFoods').isMenuAvailable(m);
const nameOf = m => String(m.name || m.titre || 'plat').trim();
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

exports.definitions = [
  fn('list_menus', "Plats des boutiques : id, nom, catégorie, prix de la boutique (ce qu'elle encaisse), disponible, stock, photo (« provisoire » = image par défaut à remplacer par la photo du marchand)."),
  fn('send_menu_list', 'Envoie au marchand la liste de ses plats avec leurs prix et leur disponibilité (comme le menu du jour).', { boutique }),
  fn(
    'propose_menu_availability',
    "Propose de rendre des plats d'UNE boutique disponibles ou indisponibles. Envoie lui-même le message avec les boutons Confirmer / Annuler ; RIEN ne change avant la confirmation. Après confirmation, Yaammoo renvoie la liste à jour.",
    {
      boutique,
      plats: {
        type: 'array',
        items: {
          type: 'object',
          properties: { plat, disponible: { type: 'boolean' }, stock: { type: 'integer', description: "Portions disponibles aujourd'hui (obligatoire pour rendre disponible un plat dont le stock est 0)" } },
          required: ['plat', 'disponible'],
          additionalProperties: false,
        },
      },
      message: { type: 'string', description: 'Texte de la demande de confirmation : plats et changement, en une ou deux phrases' },
    },
    ['plats', 'message']
  ),
  fn(
    'propose_menu_create',
    "Propose de créer des plats dans UNE boutique (boutons Confirmer / Annuler ; rien n'est créé avant). Chaque plat : nom, prix de la boutique (un ou plusieurs, avec la taille ou l'option), stock du jour, catégorie si connue. Ils auront une image provisoire en attendant la photo du marchand.",
    {
      boutique,
      plats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string' },
            categorie: { type: 'string', description: 'Ex. Poulet, Poisson, Boissons' },
            prix: {
              type: 'array',
              items: {
                type: 'object',
                properties: { prix: { type: 'integer', description: 'FCFA : ce que la boutique encaisse' }, description: { type: 'string', description: 'Taille ou option, ex. Petit, Grand' } },
                required: ['prix'],
                additionalProperties: false,
              },
            },
            stock: { type: 'integer', description: "Portions disponibles aujourd'hui" },
          },
          required: ['nom', 'prix', 'stock'],
          additionalProperties: false,
        },
      },
      message: { type: 'string', description: 'Texte de la demande de confirmation : liste des plats avec leurs prix' },
    },
    ['plats', 'message']
  ),
  fn(
    'propose_push',
    "Propose d'envoyer une notification push aux clients de la boutique (audience customers) ou aux utilisateurs d'une ville qu'elle dessert (audience city), dans le quota de son forfait. Boutons Confirmer / Annuler ; rien ne part avant.",
    {
      boutique,
      audience: { type: 'string', enum: ['customers', 'city'] },
      city: { type: 'string', description: 'Ville, seulement pour audience city' },
      title: { type: 'string', description: '50 caractères max' },
      body: { type: 'string', description: '150 caractères max' },
      message: { type: 'string', description: 'Texte de la demande de confirmation (reprend le titre et le texte de la notification)' },
    },
    ['audience', 'title', 'message']
  ),
  fn(
    'set_menu_photo',
    'Met une photo envoyée par le marchand sur un plat, tout de suite. image = adresse exacte vue dans la conversation ([image https://…]). Jamais une photo de la carte du menu.',
    { boutique, plat, image: { type: 'string' } },
    ['plat', 'image']
  ),
];

/** Boutique visée : la seule du numéro, sinon celle nommée. */
const pickShop = (ctx, name) => {
  if (ctx.shops.length === 1) return { shop: ctx.shops[0] };
  const shop = name && ctx.shops.find(s => norm(s.name) === norm(name) || norm(s.name).includes(norm(name)));
  return shop ? { shop } : { error: `Précise la boutique : ${ctx.shops.map(s => s.name).join(', ')}.` };
};

/** Plat par id ou nom exact (sans accents ni casse). */
const findMenu = (menus, ref) => menus.find(m => m.id === ref) || menus.find(m => norm(nameOf(m)) === norm(ref)) || null;

const handlers = {
  list_menus: async ctx => {
    const image = await defaultMenuImage();
    const boutiques = [];
    for (const s of ctx.shops) {
      const menus = await repos.menus.getByFastFood(s.id);
      boutiques.push({
        boutique: s.name,
        plats: menus.map(m => ({
          id: m.id,
          nom: nameOf(m),
          categorie: m.category,
          prix: (m.prices || []).map(p => ({ prixFcfa: p.price, description: p.description || null })),
          disponible: isAvailable(m),
          stock: m.stock ?? 0,
          photo: m.coverImage === image ? 'provisoire' : 'ok',
        })),
      });
    }
    return { boutiques };
  },

  send_menu_list: async (ctx, { boutique: name }) => {
    const { shop, error } = pickShop(ctx, name);
    if (error) return { error };
    const ok = await sendMenuList(shop, ctx.phone, 'ai');
    if (ok) ctx.flags.replied = true;
    return ok ? { ok: true, info: 'Liste envoyée au marchand.' } : { error: "L'envoi de la liste a échoué." };
  },

  propose_menu_availability: async (ctx, { boutique: name, plats, message }) => {
    const { shop, error } = pickShop(ctx, name);
    if (error) return { error };
    const menus = await repos.menus.getByFastFood(shop.id);
    const changes = [];
    const errors = [];
    for (const p of plats || []) {
      const m = findMenu(menus, p.plat);
      if (!m) errors.push(`Plat « ${p.plat} » introuvable (voir list_menus).`);
      else if (Number.isInteger(p.stock) && p.stock < 0) errors.push(`${nameOf(m)} : stock négatif.`);
      else if (p.disponible && !(p.stock > 0) && !((m.stock ?? 0) > 0)) errors.push(`${nameOf(m)} : stock à 0, demande au marchand combien de portions il a aujourd'hui.`);
      else changes.push({ menuId: m.id, name: nameOf(m), disponible: !!p.disponible, ...(Number.isInteger(p.stock) ? { stock: p.stock } : {}) });
    }
    if (errors.length) return { error: 'Proposition non envoyée.', details: errors };
    if (!changes.length) return { error: 'Aucun plat désigné.' };
    const summary = `Disponibilité : ${changes.map(c => `${c.name} ${c.disponible ? 'disponible' : 'indisponible'}`).join(', ')}`;
    const { pending, sent } = await pendingActions.proposeMenu({ phone: ctx.phone, fastFood: shop, action: 'menu_availability', payload: { changes }, summary, message });
    if (sent) ctx.flags.replied = true;
    return sent ? { ok: true, pendingId: pending.id, info: 'Demande de confirmation envoyée au marchand avec les boutons.' } : { error: "L'envoi de la demande de confirmation a échoué." };
  },

  propose_menu_create: async (ctx, { boutique: name, plats, message }) => {
    const { shop, error } = pickShop(ctx, name);
    if (error) return { error };
    const { validateMenuPrices } = require('../../pricing/menuPriceGuard');
    const { getFastFoodService } = require('../../fastfood/getFastFood');
    const { getPricingSettings } = require('../../settings/settings.service');
    const [existing, fastFood, pricing] = await Promise.all([repos.menus.getByFastFood(shop.id), getFastFoodService(shop.id), getPricingSettings()]);
    const errors = [];
    const list = [];
    for (const d of plats || []) {
      const nom = String(d.nom || '').trim();
      const prix = (d.prix || []).filter(p => Number.isInteger(p.prix));
      if (!nom) errors.push('Un plat sans nom.');
      else if (findMenu(existing, nom)) errors.push(`${nom} existe déjà : propose plutôt sa disponibilité.`);
      else if (!prix.length || prix.some(p => p.prix <= 0)) errors.push(`${nom} : prix manquant ou invalide.`);
      else if (!Number.isInteger(d.stock) || d.stock < 0) errors.push(`${nom} : stock du jour manquant.`);
      else {
        const prices = prix.map(p => ({ price: p.prix, ...(p.description ? { description: String(p.description).trim() } : {}) }));
        // Même contrôle que la création depuis l'app : prix refusé AVANT de proposer.
        const priceErrors = validateMenuPrices({ prices }, fastFood, pricing);
        if (priceErrors.length) errors.push(`${nom} : ${priceErrors.map(e => e.message).join(' ')}`);
        else list.push({ nom, ...(d.categorie ? { categorie: String(d.categorie).trim() } : {}), prix: prix.map(p => ({ prix: p.prix, ...(p.description ? { description: String(p.description).trim() } : {}) })), stock: d.stock });
      }
    }
    if (errors.length) return { error: 'Proposition non envoyée.', details: errors };
    if (!list.length) return { error: 'Aucun plat à créer.' };
    const summary = `Créer : ${list.map(p => p.nom).join(', ')}`;
    const { pending, sent } = await pendingActions.proposeMenu({ phone: ctx.phone, fastFood: shop, action: 'menu_create', payload: { plats: list }, summary, message });
    if (sent) ctx.flags.replied = true;
    return sent ? { ok: true, pendingId: pending.id, info: 'Demande de confirmation envoyée au marchand avec les boutons.' } : { error: "L'envoi de la demande de confirmation a échoué." };
  },

  propose_push: async (ctx, { boutique: name, audience, city, title, body, message }) => {
    const { shop, error } = pickShop(ctx, name);
    if (error) return { error };
    const t = String(title || '').trim();
    const b = String(body || '').trim();
    if (!t || t.length > 50) return { error: 'Titre requis, 50 caractères max.' };
    if (b.length > 150) return { error: 'Texte : 150 caractères max.' };
    if (!['customers', 'city'].includes(audience)) return { error: 'audience : customers ou city.' };
    if (audience === 'city' && !String(city || '').trim()) return { error: 'Ville requise pour audience city.' };
    const payload = { title: t, ...(b ? { body: b } : {}), audience, ...(audience === 'city' ? { city: String(city).trim() } : {}) };
    const summary = `Push ${audience === 'city' ? `ville ${payload.city}` : 'clients'} : ${t}`;
    const { pending, sent } = await pendingActions.proposeMenu({ phone: ctx.phone, fastFood: shop, action: 'push_customers', payload, summary, message });
    if (sent) ctx.flags.replied = true;
    return sent ? { ok: true, pendingId: pending.id, info: 'Demande de confirmation envoyée au marchand avec les boutons.' } : { error: "L'envoi de la demande de confirmation a échoué." };
  },

  set_menu_photo: async (ctx, { boutique: name, plat: ref, image }) => {
    const { shop, error } = pickShop(ctx, name);
    if (error) return { error };
    // Seule une photo envoyée par CE numéro ces 3 derniers jours peut être posée.
    const sinceIso = new Date(Date.now() - 3 * 864e5).toISOString();
    const history = await repos.waConversations.listByPhone(ctx.phone, { sinceIso, limit: 300 });
    const received = new Set(history.filter(h => h.direction === 'in').flatMap(h => imagesIn(h.body)));
    if (!received.has(image)) return { error: "Cette image n'a pas été envoyée par le marchand (copie l'adresse exacte de [image …])." };
    const menu = findMenu(await repos.menus.getByFastFood(shop.id), ref);
    if (!menu) return { error: `Plat « ${ref} » introuvable (voir list_menus).` };
    const { updateMenuService } = require('../../menu/updateMenu.service');
    const r = await updateMenuService(menu.id, { coverImage: image, coverImageHasBackground: true, images: [image] });
    return r.success ? { ok: true, info: `Photo posée sur ${nameOf(menu)}.` } : { error: r.message };
  },
};

exports.handlers = handlers;
