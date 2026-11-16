// Outils « livreurs » de l'agent IA du MARCHAND WhatsApp : lister ses livreurs, en ajouter
// un, lui confier des commandes (DIRECT, sans boutons : décision du 16/11/2026), lui
// relayer un message. Le livreur reçoit la fiche (coordonnées du client comprises) sur
// WhatsApp ; ni le marchand ni le modèle ne voient ces coordonnées.
// Fusionné dans agentTools.js. Doc : architecture/whatsapp-ai.md (« Livreurs »).
const { resolveRefs, viewOf } = require('./agentOrders');
const { fn } = require('./agentLoop');
const dir = require('../driver/driverDirectory');
const deliveries = require('../driver/driverDeliveries.service');
const accounts = require('../driver/driverAccounts.service');

const ACTIVE = ['processing', 'finished', 'delivering'];
const shopArg = { type: 'string', description: 'Nom de la boutique (seulement si le numéro en pilote plusieurs)' };
const driverArg = { type: 'string', description: 'Nom ou numéro de téléphone du livreur' };

exports.definitions = [
  fn('list_drivers', 'Livreurs rattachés à la boutique : nom, téléphone, numéro de paiement Orange Money / MTN MoMo validé ou non, commandes qui leur sont confiées.'),
  fn(
    'add_driver',
    "Ajoute un livreur à la boutique par son numéro WhatsApp (compte créé s'il n'existe pas). Il reçoit un message de bienvenue ; il devra valider son numéro Orange Money / MTN MoMo avant de livrer.",
    { telephone: { type: 'string' }, prenom: { type: 'string' }, nom: { type: 'string' }, boutique: shopArg },
    ['telephone']
  ),
  fn(
    'assign_driver',
    'Confie tout de suite des commandes acceptées (en cours, terminées ou en livraison) à un livreur de la boutique. Il reçoit la fiche de chaque commande sur WhatsApp et la passe en livraison quand il part.',
    { refs: { type: 'array', items: { type: 'string' }, description: 'Numéros de commande (6 caractères) ou ids' }, livreur: driverArg },
    ['refs', 'livreur']
  ),
  fn('message_driver', 'Envoie un message de la boutique à un livreur (question, consigne). Sa réponse arrivera au marchand.', { livreur: driverArg, texte: { type: 'string' } }, ['livreur', 'texte']),
];

const digits = s => String(s || '').replace(/\D/g, '');
const shopFor = (ctx, name) => (ctx.shops.length === 1 || !name ? ctx.shops[0] : ctx.shops.find(s => String(s.name).toLowerCase().includes(String(name).toLowerCase())));

/** Livreur désigné par nom ou numéro parmi ceux de la boutique. */
const findDriver = (drivers, who) => {
  const d = digits(who);
  if (d.length >= 8) return drivers.filter(x => digits(x.phone).endsWith(d.slice(-9)));
  const q = String(who || '')
    .trim()
    .toLowerCase();
  return drivers.filter(x => x.name.toLowerCase().includes(q));
};

const pickDriver = async (fastFood, who) => {
  const found = findDriver(await dir.shopDrivers(fastFood.id), who);
  if (found.length === 1) return { driver: found[0] };
  return { error: found.length ? `Plusieurs livreurs correspondent à « ${who} » : ${found.map(x => x.name).join(', ')}.` : `Aucun livreur « ${who} » dans la boutique ${fastFood.name}.` };
};

exports.handlers = {
  list_drivers: async ctx => {
    const out = [];
    for (const shop of ctx.shops) {
      const drivers = await dir.shopDrivers(shop.id);
      out.push({
        boutique: shop.name,
        livreurs: drivers.map(d => ({
          nom: d.name,
          telephone: d.phone,
          numeroPaiementValide: d.payoutReady,
          commandesConfiees: ctx.orders.filter(o => o.driverId === d.uid && ACTIVE.includes(o.status)).map(o => viewOf(o).ref),
        })),
      });
    }
    return { boutiques: out };
  },

  add_driver: async (ctx, { telephone, prenom, nom, boutique }) => {
    const fastFood = shopFor(ctx, boutique);
    if (!fastFood) return { error: `Boutique « ${boutique} » introuvable.` };
    const r = await accounts.addDriver({ fastFood, phone: telephone, prenom, nom });
    if (!r.ok) return { error: r.message };
    return { ok: true, livreur: r.name, dejaLivreur: !!r.already, numeroPaiementValide: r.payoutReady, info: 'Message de bienvenue envoyé au livreur.' };
  },

  assign_driver: async (ctx, { refs, livreur }) => {
    const { found, missing } = resolveRefs(refs, ctx.orders);
    if (missing.length) return { error: `Commandes introuvables : ${missing.join(', ')}` };
    if (!found.length) return { error: 'Aucune commande désignée.' };
    if (new Set(found.map(o => o.fastFoodId)).size > 1) return { error: 'Une boutique à la fois : sépare les commandes par boutique.' };
    const fastFood = ctx.shops.find(s => s.id === found[0].fastFoodId);
    const { driver, error } = await pickDriver(fastFood, livreur);
    if (error) return { error };
    const r = await deliveries.assignOrders({ fastFood, driver, orders: found });
    await ctx.reload();
    if (!r.assigned.length) return { error: 'Aucune commande confiée.', details: r.lines };
    return { ok: true, livreur: driver.name, confiees: r.assigned.map(o => viewOf(o).ref), problemes: r.lines, info: 'Fiches envoyées au livreur sur WhatsApp.' };
  },

  message_driver: async (ctx, { livreur, texte }) => {
    for (const shop of ctx.shops) {
      const { driver } = await pickDriver(shop, livreur);
      if (!driver) continue;
      if (!driver.phone) return { error: `${driver.name} n'a pas de numéro WhatsApp.` };
      const r = await deliveries.relay(driver.phone, ctx.phone, `Message de la boutique ${shop.name} : ${String(texte).slice(0, 900)}`);
      return r.ok ? { ok: true, info: `Message envoyé à ${driver.name}.` } : { error: "L'envoi a échoué." };
    }
    return { error: `Aucun livreur « ${livreur} » dans la boutique.` };
  },
};
