// Outils (function calling) de l'agent IA du MARCHAND WhatsApp : définitions envoyées au
// modèle et exécution. Chaque outil passe par les services existants ; aucune écriture de
// statut sans confirmation du marchand (propose_action -> confirm_action ou bouton Confirmer).
// Livreurs (lister, ajouter, confier, message) : merchantDriverTools.js. Plats (liste avec
// prix, disponibilité, création, photo) : merchantMenuTools.js.
// `ctx` = { phone, shops, orders (vue marchand), views, flags }. Doc : architecture/whatsapp-ai.md.
const { resolveRefs, viewOf, searchOrders, findOrder, daySummary } = require('./agentOrders');
const pendingActions = require('./pendingActions.service');
const { fn, runTool, searchParams } = require('./agentLoop');
const driverTools = require('./merchantDriverTools');
const menuTools = require('./merchantMenuTools');
const escalation = require('./escalationTool');
const refs = { type: 'array', items: { type: 'string' }, description: 'Numéros de commande (6 caractères, ex. A1B2C3) ou ids complets' };
const ref = { type: 'string', description: 'Numéro de commande (6 caractères, ex. A1B2C3) ou id complet' };

exports.definitions = [
  fn(
    'list_orders',
    "Commandes EN COURS de la boutique (vue marchand), plus récentes d'abord, par pages. Page suivante (page + 1) seulement si le marchand demande la suite. Les commandes livrées ou annulées ne se listent pas ici : bilan avec day_summary, détail d'une commande avec get_order.",
    searchParams
  ),
  fn('get_order', "Détail d'une commande par son numéro, cherchée en base si elle n'est pas dans le contexte (sans limite de date : litige, vérification).", { ref }, ['ref']),
  fn('day_summary', "Bilan d'UN jour (aujourd'hui par défaut) : nombre de commandes par statut et montant encaissé par la boutique pour les livrées. À utiliser pour « faire le compte », à la place de la liste.", {
    jour: { type: 'string', description: "AAAA-MM-JJ ; absent = aujourd'hui" },
  }),
  fn(
    'propose_action',
    "Propose au marchand une action sur des commandes d'UNE boutique. Envoie lui-même le message avec les boutons Confirmer / Annuler ; RIEN n'est modifié avant sa confirmation. accept = accepter (en attente), refuse = refuser (en attente ; client remboursé), finished = passer en « terminée », delivering = passer en « livraison en cours » (les étapes intermédiaires sont faites dans l'ordre), cancel_accept / cancel_refuse = accepter / refuser la demande d'annulation du client (commande en attente avec demandeAnnulation).",
    {
      action: { type: 'string', enum: pendingActions.ACTIONS },
      refs,
      message: { type: 'string', description: 'Texte de la demande de confirmation : commandes (n°, plats) et action, en une ou deux phrases' },
    },
    ['action', 'refs', 'message']
  ),
  fn('confirm_action', 'Exécute une proposition en attente que le marchand vient de confirmer PAR ÉCRIT (« oui », « vas-y »…). Yaammoo envoie lui-même le récapitulatif.', { pendingId: { type: 'string' } }, ['pendingId']),
  fn('cancel_action', 'Annule une proposition en attente que le marchand refuse.', { pendingId: { type: 'string' } }, ['pendingId']),
  ...driverTools.definitions,
  ...menuTools.definitions,
  escalation.definition,
];

const shopOf = (ctx, order) => ctx.shops.find(s => s.id === order.fastFoodId);
const notFound = r => ({ error: `Commande « ${r} » introuvable parmi les commandes de la boutique.` });

const handlers = {
  list_orders: async (ctx, { statuts, page }) => {
    const r = await searchOrders({ shops: ctx.shops, statuts, page, pageSize: ctx.pageSize });
    return { commandes: r.views, page: r.page, pageSuivante: r.pageSuivante };
  },

  day_summary: async (ctx, { jour }) => ({ bilan: await daySummary({ shops: ctx.shops, jour }) }),

  get_order: async (ctx, { ref: r }) => {
    const found = await findOrder({ ref: r, loaded: ctx.orders, shops: ctx.shops });
    return found ? { commande: found.view } : notFound(r);
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
    if (sent) ctx.flags.replied = true;
    return sent ? { ok: true, pendingId: pending.id, info: 'Demande de confirmation envoyée au marchand avec les boutons.' } : { error: "L'envoi de la demande de confirmation a échoué." };
  },

  confirm_action: async (ctx, { pendingId }) => {
    const r = await pendingActions.execute(pendingId, ctx.phone);
    if (r.ok) {
      ctx.flags.replied = true;
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
exports.run = (ctx, name, rawArgs) => runTool({ ...handlers, ...driverTools.handlers, ...menuTools.handlers, alert_admin: escalation.handler('merchant') }, ctx, name, rawArgs);
