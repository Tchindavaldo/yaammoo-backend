// Outils (function calling) de l'agent IA WhatsApp : définitions envoyées au modèle et
// exécution. Chaque outil passe par les services existants ; aucune écriture de statut
// sans confirmation du marchand (propose_action -> confirm_action ou bouton Confirmer).
// `ctx` = { phone, shops, orders (vue marchand), views, flags }. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { ACTIVE, resolveRefs, viewOf } = require('./agentOrders');
const pendingActions = require('./pendingActions.service');

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const refs = { type: 'array', items: { type: 'string' }, description: 'Numéros de commande (6 caractères, ex. A1B2C3) ou ids complets' };
const ref = { type: 'string', description: 'Numéro de commande (6 caractères, ex. A1B2C3) ou id complet' };

exports.definitions = [
  fn('list_orders', 'Liste les commandes de la boutique (30 derniers jours, vue marchand). Par défaut : les commandes en cours.', {
    statuts: { type: 'array', items: { type: 'string', enum: ['pending', 'processing', 'finished', 'delivering', 'delivered', 'cancelByFastFood', 'cancelByUser'] }, description: 'Filtre de statuts (absent = en cours)' },
  }),
  fn('get_order', "Détail d'une commande.", { ref }, ['ref']),
  fn('list_menus', 'Plats de la boutique (nom, catégorie, statut, stock). Sans prix.'),
  fn(
    'propose_action',
    "Propose au marchand une action sur des commandes d'UNE boutique. Envoie lui-même le message avec les boutons Confirmer / Annuler ; RIEN n'est modifié avant sa confirmation. accept = accepter (en attente), refuse = refuser (en attente ; client remboursé), finished = passer en « terminée », delivering = passer en « livraison en cours » (les étapes intermédiaires sont faites dans l'ordre).",
    {
      action: { type: 'string', enum: pendingActions.ACTIONS },
      refs,
      message: { type: 'string', description: 'Texte de la demande de confirmation : commandes (n°, plats) et action, en une ou deux phrases' },
    },
    ['action', 'refs', 'message']
  ),
  fn('confirm_action', "Exécute une proposition en attente que le marchand vient de confirmer PAR ÉCRIT (« oui », « vas-y »…). Yaammoo envoie lui-même le récapitulatif.", { pendingId: { type: 'string' } }, ['pendingId']),
  fn('cancel_action', 'Annule une proposition en attente que le marchand refuse.', { pendingId: { type: 'string' } }, ['pendingId']),
];

const shopOf = (ctx, order) => ctx.shops.find(s => s.id === order.fastFoodId);
const one = (ctx, r) => resolveRefs([r], ctx.orders).found[0];
const notFound = r => ({ error: `Commande « ${r} » introuvable parmi les commandes de la boutique (30 derniers jours).` });

const handlers = {
  list_orders: async (ctx, { statuts }) => {
    const wanted = statuts?.length ? statuts : ACTIVE;
    return { commandes: ctx.views.filter(v => wanted.includes(v.statut)) };
  },

  get_order: async (ctx, { ref: r }) => {
    const order = one(ctx, r);
    if (!order) return notFound(r);
    return { commande: viewOf(order, shopOf(ctx, order)?.name) };
  },

  list_menus: async ctx => {
    const shops = [];
    for (const s of ctx.shops) {
      const menus = await repos.menus.getByFastFood(s.id);
      shops.push({ boutique: s.name, plats: menus.map(mn => ({ nom: mn.name || mn.titre, categorie: mn.category, statut: mn.status, stock: mn.stock, disponibilite: mn.disponibilite })) });
    }
    return { boutiques: shops };
  },

  propose_action: async (ctx, { action, refs: list, message }) => {
    if (!pendingActions.ACTIONS.includes(action)) return { error: `Action inconnue : ${action}` };
    const { found, missing } = resolveRefs(list, ctx.orders);
    if (missing.length) return { error: `Commandes introuvables : ${missing.join(', ')}` };
    if (!found.length) return { error: 'Aucune commande désignée.' };
    if (new Set(found.map(o => o.fastFoodId)).size > 1) return { error: 'Une proposition par boutique : sépare les commandes par boutique.' };
    const blocked = found.map(o => [o, pendingActions.blockerOf(action, o)]).filter(([, b]) => b);
    if (blocked.length) return { error: 'Action impossible sur certaines commandes.', details: blocked.map(([o, b]) => `n°${viewOf(o).ref} : ${b}`) };
    const { pending, sent } = await pendingActions.propose({ phone: ctx.phone, fastFood: shopOf(ctx, found[0]), action, orders: found, message });
    if (sent) ctx.flags.sentToMerchant = true;
    return sent ? { ok: true, pendingId: pending.id, info: 'Demande de confirmation envoyée au marchand avec les boutons.' } : { error: "L'envoi de la demande de confirmation a échoué." };
  },

  confirm_action: async (ctx, { pendingId }) => {
    const r = await pendingActions.execute(pendingId, ctx.phone);
    if (r.ok) {
      ctx.flags.sentToMerchant = true;
      await ctx.reload(); // statuts changés : les outils suivants relisent la base
    }
    return r.ok ? { ok: true, resultat: r.message, info: 'Récapitulatif déjà envoyé au marchand.' } : { error: r.message };
  },

  cancel_action: async (ctx, { pendingId }) => {
    const r = await pendingActions.cancel(pendingId, ctx.phone);
    return r.ok ? { ok: true, resultat: r.message } : { error: r.message };
  },
};

/** Exécute un appel d'outil du modèle. Renvoie toujours un objet (erreur comprise). */
exports.run = async (ctx, name, rawArgs) => {
  const handler = handlers[name];
  if (!handler) return { error: `Outil inconnu : ${name}` };
  let args = {};
  try {
    args = typeof rawArgs === 'string' && rawArgs.trim() ? JSON.parse(rawArgs) : rawArgs || {};
  } catch {
    return { error: 'Arguments JSON invalides.' };
  }
  try {
    return await handler(ctx, args);
  } catch (e) {
    console.error(`❌ [AI] outil ${name} : ${e.message}`);
    return { error: `Échec de l'outil ${name}.` };
  }
};
