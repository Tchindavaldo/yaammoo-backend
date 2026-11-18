// Outils de l'agent IA ADMIN WhatsApp (migration 098) : lecture directe (alertes, support,
// boutiques, commandes, réglages) et super-actions proposées puis confirmées par
// l'administrateur (adminActions.service.js). `ctx` = { phone, flags }.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { fn, runTool } = require('../ai/agentLoop');
const actions = require('./adminActions.service');
const msg = require('../merchantMessages');

const when = iso => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Douala', dateStyle: 'short', timeStyle: 'short' }) : null);
const cut = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

exports.definitions = [
  fn('list_alerts', 'Alertes ouvertes (boutiques, livreurs, support), plus récentes d’abord.'),
  fn('close_alert', 'Ferme une alerte traitée.', { alertId: { type: 'string' } }, ['alertId']),
  fn('support_threads', 'Fils du support de la plateforme (messages des utilisateurs à Yaammoo).', {
    nonLus: { type: 'boolean', description: 'true = seulement ceux qui attendent une réponse' },
  }),
  fn('support_messages', "Messages d'un fil support, dans l'ordre.", { threadId: { type: 'string' } }, ['threadId']),
  fn('support_stats', 'Bilan du support de la plateforme sur N jours : nombre de fils par catégorie (question, probleme, assistance, suggestion, discussion) et en attente de réponse.', {
    jours: { type: 'integer', description: '7 par défaut' },
  }),
  fn('find_shop', 'Cherche une boutique par son nom : id, nom, mode WhatsApp, masquée.', { nom: { type: 'string' } }, ['nom']),
  fn('find_order', "Commande par son id ou son n° (6 derniers caractères) : statut, boutique, plats, total payé, date.", { ref: { type: 'string' } }, ['ref']),
  fn('list_settings', 'Réglages de la plateforme (clé, valeur, description). filtre = mot contenu dans la clé.', { filtre: { type: 'string' } }),
  fn(
    'propose_admin_action',
    "Propose une super-action à l'administrateur : envoie lui-même le résumé avec les boutons Confirmer / Annuler ; RIEN ne s'exécute avant sa confirmation.",
    {
      action: { type: 'string', enum: actions.ACTIONS },
      params: { type: 'object', description: 'Paramètres de l’action (voir les consignes)' },
      message: { type: 'string', description: 'Une phrase qui introduit la demande de confirmation' },
    },
    ['action', 'params']
  ),
  fn('confirm_admin_action', "Exécute une action en attente que l'administrateur vient de confirmer PAR ÉCRIT (« oui », « vas-y »).", { actionId: { type: 'string' } }, ['actionId']),
  fn('cancel_admin_action', "Annule une action en attente que l'administrateur refuse.", { actionId: { type: 'string' } }, ['actionId']),
];

const handlers = {
  list_alerts: async () => ({
    alertes: (await repos.waAdminAlerts.listOpen(20)).map(a => ({ alertId: a.id, source: a.source, resume: a.summary, details: cut(a.details, 600), whatsapp: a.sourcePhone, threadId: a.threadId, le: when(a.createdAt) })),
  }),

  close_alert: async (ctx, { alertId }) => {
    await repos.waAdminAlerts.close(alertId);
    return { ok: true };
  },

  support_threads: async (ctx, { nonLus }) => {
    const threads = (await repos.supportThreads.getPlatformThreads()).filter(t => !nonLus || (t.supportUnreadCount || 0) > 0);
    return {
      fils: threads.slice(0, 20).map(t => ({ threadId: t.id, utilisateur: t.client?.nom || null, categorie: t.topic, titre: t.title, dernierMessage: cut(t.lastMessage, 200), enAttente: t.supportUnreadCount || 0, statut: t.status, maj: when(t.updatedAt) })),
      total: threads.length,
    };
  },

  support_messages: async (ctx, { threadId }) => {
    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { error: 'Fil introuvable.' };
    const messages = await repos.supportThreads.getMessagesByThread(threadId);
    return { fil: { titre: thread.title, categorie: thread.topic, utilisateur: thread.client?.nom || null }, messages: messages.slice(-30).map(m => ({ de: m.author === 'support' ? 'Yaammoo' : 'utilisateur', texte: cut(m.text, 800), le: when(m.createdAt) })) };
  },

  support_stats: async (ctx, { jours }) => {
    const days = Number.isInteger(jours) && jours > 0 ? Math.min(jours, 365) : 7;
    const since = Date.now() - days * 864e5;
    const threads = (await repos.supportThreads.getPlatformThreads()).filter(t => new Date(t.createdAt).getTime() >= since);
    const parCategorie = {};
    for (const t of threads) parCategorie[t.topic || 'autre'] = (parCategorie[t.topic || 'autre'] || 0) + 1;
    return { jours: days, nouveauxFils: threads.length, parCategorie, enAttenteDeReponse: threads.filter(t => (t.supportUnreadCount || 0) > 0).length };
  },

  find_shop: async (ctx, { nom }) => {
    const { getHiddenFastfoodIds } = require('../../settings/settings.service');
    const hidden = await getHiddenFastfoodIds();
    const found = await repos.fastfoods.searchByName(nom, { limit: 8 });
    const shops = await Promise.all(found.map(f => repos.fastfoods.getById(f.id)));
    return { boutiques: shops.filter(Boolean).map(s => ({ fastFoodId: s.id, nom: s.name, modeWhatsapp: s.whatsappOrders === true, masquee: hidden.has(s.id) })) };
  },

  find_order: async (ctx, { ref }) => {
    const byId = await repos.orders.getById(ref).catch(() => null);
    const list = byId ? [byId] : await repos.orders.findByIdSuffixAny(ref);
    if (!list.length) return { error: `Commande ${ref} introuvable.` };
    const out = [];
    for (const o of list) {
      const shop = await repos.fastfoods.getById(o.fastFoodId).catch(() => null);
      out.push({ orderId: o.id, numero: msg.ref(o), statut: msg.statusLabel(o.status), boutique: shop?.name || o.fastFoodId, plats: msg.plats(o), totalPayeFcfa: o.total, livraison: msg.livraison(o), creeeLe: when(o.createdAt), demandeAnnulation: o.cancelRequest?.status || null });
    }
    return { commandes: out };
  },

  list_settings: async (ctx, { filtre }) => {
    const term = String(filtre || '').toLowerCase();
    const rows = (await repos.settings.listDetailed()).filter(r => !term || r.key.toLowerCase().includes(term));
    return { reglages: rows.slice(0, 40).map(r => ({ cle: r.key, valeur: r.value, categorie: r.category, description: cut(r.description, 160) })), total: rows.length };
  },

  propose_admin_action: async (ctx, { action, params, message }) => {
    const r = await actions.propose({ phone: ctx.phone, action, params, message });
    if (r.ok) ctx.flags.replied = true;
    return r.ok ? { ok: true, actionId: r.actionId, info: 'Demande de confirmation envoyée avec les boutons.' } : { error: r.error };
  },

  confirm_admin_action: async (ctx, { actionId }) => {
    const r = await actions.execute(actionId, ctx.phone);
    return r.ok ? { ok: true, resultat: r.message } : { error: r.message };
  },

  cancel_admin_action: async (ctx, { actionId }) => {
    const r = await actions.cancel(actionId, ctx.phone);
    return r.ok ? { ok: true, resultat: r.message } : { error: r.message };
  },
};

/** Exécute un appel d'outil du modèle. Renvoie toujours un objet (erreur comprise). */
exports.run = (ctx, name, rawArgs) => runTool(handlers, ctx, name, rawArgs);
