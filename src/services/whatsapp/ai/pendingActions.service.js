// Actions proposées par l'agent IA au marchand WhatsApp (table wa_ai_pending_actions,
// migrations 090 / 091) : accepter, refuser, passer en « terminée » ou « en livraison »,
// accepter ou refuser la demande d'annulation du client (merchantCancelRequests.service),
// changer la disponibilité des plats ou en créer (menuActions.js, migration 097).
// RIEN ne change sans confirmation : l'agent propose (message + boutons Confirmer /
// Annuler), le marchand clique ou répond par écrit (l'agent appelle alors confirm_action).
// L'exécution passe par les services existants (updateOrders ; refus = cancelByFastFood,
// client remboursé par orderCancel.service, comme le bouton Refuser).
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { onButton } = require('../webhookEvents.service');
const msg = require('../merchantMessages');
const { shopPhone, send, sendText, replyRecap } = require('../merchantChannel');

// Rang de chaque statut actif : l'avance se fait pas à pas (updateOrders avance d'un cran).
const RANK = { pending: 0, processing: 1, finished: 2, delivering: 3 };
// Statut visé par chaque action. « Livrée » n'en fait pas partie : seul le QR du client la valide.
const TARGET = { accept: 'processing', finished: 'finished', delivering: 'delivering' };
const LABEL = {
  accept: 'Accepter',
  refuse: 'Refuser',
  finished: 'Passer en « terminée »',
  delivering: 'Passer en « livraison en cours »',
  cancel_accept: "Accepter l'annulation demandée par le client",
  cancel_refuse: "Refuser l'annulation demandée par le client",
};
const CANCEL_REQUEST = ['cancel_accept', 'cancel_refuse'];
// Actions hors commandes, détail dans `payload` : plats (migration 097, menuActions.js) et
// push aux clients (migration 098, shopPushActions.js).
const EXECUTORS = { menu_availability: './menuActions', menu_create: './menuActions', push_customers: './shopPushActions' };
const PAYLOAD_ACTIONS = Object.keys(EXECUTORS);
// Une proposition non confirmée sous 24 h n'est plus exécutable (la fenêtre WhatsApp est close).
const MAX_AGE_MS = 24 * 3600e3;

exports.ACTIONS = Object.keys(LABEL);

/** null si l'action est possible sur la commande, sinon la raison. */
exports.blockerOf = (action, order) => {
  if (!(order.status in RANK)) return `déjà ${msg.statusLabel(order.status)}`;
  if (CANCEL_REQUEST.includes(action)) {
    if (order.cancelRequest?.status !== 'pending') return "pas de demande d'annulation en attente";
    return order.status === 'pending' ? null : `déjà ${msg.statusLabel(order.status)}`;
  }
  if (action === 'accept' || action === 'refuse') return order.status === 'pending' ? null : `déjà ${msg.statusLabel(order.status)}`;
  return RANK[order.status] < RANK[TARGET[action]] ? null : `déjà ${msg.statusLabel(order.status)}`;
};

/**
 * Crée la proposition et l'envoie au marchand avec les boutons Confirmer / Annuler
 * (payloads `<id>:ai_yes` / `<id>:ai_no`). `orders` : commandes d'UNE boutique.
 */
exports.propose = async ({ phone, fastFood, action, orders, message }) => {
  const pending = await repos.waAiPendingActions.create({
    phone,
    fastFoodId: fastFood.id,
    action,
    orderIds: orders.map(o => o.id),
    summary: `${LABEL[action]} : ${orders.map(o => `n°${msg.ref(o)}`).join(', ')}`,
  });
  return { pending, sent: await sendProposal(pending, message, phone) };
};

/** Proposition hors commandes pour UNE boutique (plats, push ; `payload` lu par son exécuteur). */
exports.proposeMenu = async ({ phone, fastFood, action, payload, summary, message }) => {
  if (!PAYLOAD_ACTIONS.includes(action)) throw new Error(`Action inconnue : ${action}`);
  const pending = await repos.waAiPendingActions.create({ phone, fastFoodId: fastFood.id, action, orderIds: [], payload, summary: String(summary).slice(0, 500) });
  return { pending, sent: await sendProposal(pending, message, phone) };
};

/** Message de la proposition avec les boutons Confirmer / Annuler. Renvoie true si envoyé. */
const sendProposal = async (pending, message, phone) => {
  const body = String(message || pending.summary).slice(0, 1000);
  const r = await send(
    {
      to: phone,
      type: 'interactive',
      reference: `ai_${pending.id}`,
      interactive: {
        kind: 'buttons',
        body,
        buttons: [
          { id: `${pending.id}:ai_yes`, title: 'Confirmer' },
          { id: `${pending.id}:ai_no`, title: 'Annuler' },
        ],
      },
    },
    `Proposition IA ${pending.id}`,
    'ai'
  );
  return r.ok;
};

/** Avance une commande pas à pas jusqu'au statut visé. Renvoie null ou le message d'échec. Aussi utilisé par l'agent admin. */
const advance = async (order, target, fastFood) => {
  // Chargé ici : updateOrders appelle notifyNewOrders (dépendance circulaire sinon).
  const { updateOrders } = require('../../order/updateOrders.service');
  const statuses = Object.keys(RANK);
  for (let step = RANK[order.status]; step < RANK[target]; step += 1) {
    // expectedStatus : une action croisée (bouton, livreur) ne fait jamais sauter d'étape.
    const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId }], fastFood.userId, null, { expectedStatus: statuses[step] });
    if (!r?.success) return r?.message || 'mise à jour impossible';
  }
  return null;
};

/** Applique l'action (statuts relus en base). Renvoie le compte rendu texte. */
const apply = async (pending, fastFood, to) => {
  const orders = (await Promise.all(pending.orderIds.map(id => repos.orders.getById(id)))).filter(o => o && o.fastFoodId === fastFood.id);
  const lines = [];
  const done = [];
  const reports = [];
  for (const o of orders) {
    const blocker = exports.blockerOf(pending.action, o);
    if (blocker) {
      lines.push(`Commande n°${msg.ref(o)} : ${blocker}.`);
      continue;
    }
    if (CANCEL_REQUEST.includes(pending.action)) {
      // Même chemin que les boutons Accepter / Refuser l'annulation (messages au marchand inclus).
      const flow = require('../merchantCancelRequests.service');
      const r = await (pending.action === 'cancel_accept' ? flow.acceptFromMerchant(o, to) : flow.refuseFromMerchant(o, to));
      reports.push(r.message);
      continue;
    }
    if (pending.action === 'refuse') {
      const { updateOrders } = require('../../order/updateOrders.service');
      const r = await updateOrders([{ id: o.id, fastFoodId: o.fastFoodId, status: 'cancelByFastFood' }], fastFood.userId);
      lines.push(r?.success ? `Commande n°${msg.ref(o)} refusée. Le client sera remboursé.` : `Commande n°${msg.ref(o)} : ${r?.message || 'refus impossible'}.`);
      continue;
    }
    const failure = await advance(o, TARGET[pending.action], fastFood);
    if (failure) lines.push(`Commande n°${msg.ref(o)} : ${failure}.`);
    else done.push(o);
  }
  if (lines.length) await sendText(to, lines.join('\n'));
  // Récapitulatif + bouton de l'étape suivante, comme après un clic sur le suivi.
  if (done.length) await replyRecap(to, done);
  return [...lines, ...reports, ...done.map(o => `Commande n°${msg.ref(o)} : ${msg.statusLabel(TARGET[pending.action])}.`)].join(' ') || 'Aucune commande à mettre à jour.';
};

/**
 * Exécute une proposition confirmée par le marchand (bouton ou réponse écrite).
 * Close AVANT d'agir : une double confirmation n'exécute qu'une fois.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
exports.execute = async (id, phone) => {
  const pending = await repos.waAiPendingActions.getById(id);
  if (!pending || pending.phone !== phone) return { ok: false, message: 'Proposition introuvable.' };
  if (pending.status !== 'open') return { ok: false, message: `Proposition déjà ${pending.status === 'done' ? 'exécutée' : 'annulée ou expirée'}.` };
  if (Date.now() - new Date(pending.createdAt).getTime() > MAX_AGE_MS) {
    await repos.waAiPendingActions.resolveIfOpen(id, 'expired');
    return { ok: false, message: 'Proposition expirée (plus de 24 h) : redemandez.' };
  }
  const fastFood = await repos.fastfoods.getById(pending.fastFoodId);
  const to = await shopPhone(fastFood);
  // Seul le numéro WhatsApp de la boutique pilote ses commandes.
  if (!to || to !== phone) return { ok: false, message: 'Ce numéro ne pilote pas cette boutique.' };
  const claimed = await repos.waAiPendingActions.resolveIfOpen(id, 'done');
  if (!claimed) return { ok: false, message: 'Proposition déjà traitée.' };
  const result = EXECUTORS[pending.action] ? await require(EXECUTORS[pending.action]).apply(pending, fastFood, to) : await apply(pending, fastFood, to);
  await repos.waAiPendingActions.setResult(id, result);
  return { ok: true, message: result };
};

/** Le marchand renonce à la proposition. */
exports.cancel = async (id, phone) => {
  const pending = await repos.waAiPendingActions.getById(id);
  if (!pending || pending.phone !== phone) return { ok: false, message: 'Proposition introuvable.' };
  const closed = await repos.waAiPendingActions.resolveIfOpen(id, 'cancelled');
  return closed ? { ok: true, message: `Annulé : ${pending.summary}.` } : { ok: false, message: 'Proposition déjà traitée.' };
};

/** Boutons Confirmer / Annuler des propositions de l'agent (payload `<id>:ai_yes|ai_no`). */
exports.registerAiButtons = () => {
  onButton('ai_yes', async ({ ref, event }) => {
    const r = await exports.execute(ref, event.from);
    if (!r.ok) await sendText(event.from, r.message);
  });
  onButton('ai_no', async ({ ref, event }) => {
    const r = await exports.cancel(ref, event.from);
    await sendText(event.from, r.ok ? `${r.message} Rien n'a été modifié.` : r.message);
  });
};

exports.advance = advance;
