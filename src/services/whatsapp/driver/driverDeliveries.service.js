// Courses des livreurs des boutiques WhatsApp. Le marchand confie des commandes à un de
// ses livreurs (agent IA du marchand) : affectation (`order.driverId`, sockets de
// driverOrders.service, l'app est à jour), fiche envoyée au livreur sur WhatsApp avec le
// bouton « Je pars en livraison » (`<id>:drv_go`). Le livreur part (bouton ou agent IA
// du livreur) : la commande avance pas à pas jusqu'à « en livraison », le marchand est
// prévenu. Messages relayés marchand <-> livreur (`relay_<numéro>`).
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const repos = require('../../../repositories');
const { onButton, onSendFailed } = require('../webhookEvents.service');
const msg = require('../merchantMessages');
const { shopPhone, send, sendText } = require('../merchantChannel');
const dir = require('./driverDirectory');
const text = require('./driverMessages');

// Erreur Meta « message hors fenêtre de 24 h » : seul un template passe.
const OUT_OF_WINDOW = 131047;
const RANK = { pending: 0, processing: 1, finished: 2, delivering: 3 };
const STATUSES = Object.keys(RANK);
// Commandes qu'un marchand peut confier : acceptées, pas encore livrées.
const ASSIGNABLE = ['processing', 'finished', 'delivering'];

const merchantAmount = async order => {
  const { toMerchantViewOne } = require('../../order/toMerchantView');
  return (await toMerchantViewOne(order))?.total;
};

/** Fiche de la commande au livreur, avec le bouton « Je pars en livraison » tant qu'il n'est pas parti. */
const sendCard = async (to, order, shop, author = 'system') => {
  const card = text.card(order, shop.name, await merchantAmount(order));
  if (order.status === 'delivering') return sendText(to, `${card}\n\n${text.QR_LINE}`, author);
  return send({ to, type: 'interactive', reference: `drvorder_${order.id}`, interactive: { kind: 'buttons', body: card.slice(0, 1024), buttons: [{ id: `${order.id}:drv_go`, title: 'Je pars en livraison' }] } }, `Course ${order.id}`, author);
};
exports.sendCard = sendCard;

/**
 * Le marchand confie `orders` (d'UNE boutique) au livreur `driver` (entrée de
 * driverDirectory.shopDrivers). Livreur sans numéro OM / MoMo validé : refusé.
 * @returns {Promise<{ assigned: object[], lines: string[] }>}
 */
exports.assignOrders = async ({ fastFood, driver, orders }) => {
  if (!driver.payoutReady) {
    return { assigned: [], lines: [`${driver.name} n'a pas encore de numéro Orange Money / MTN MoMo validé : il ne peut pas livrer avant de l'avoir envoyé à Yaammoo sur WhatsApp.`] };
  }
  if (!driver.phone) return { assigned: [], lines: [`${driver.name} n'a pas de numéro WhatsApp sur son compte.`] };
  const { assignDriver } = require('../../order/driverOrders.service');
  const assigned = [];
  const lines = [];
  for (const o of orders) {
    const fresh = await repos.orders.getById(o.id);
    if (!fresh || fresh.fastFoodId !== fastFood.id) lines.push(`Commande n°${msg.ref(o)} introuvable.`);
    else if (fresh.delivery?.status !== true) lines.push(`Commande n°${msg.ref(fresh)} : à retirer sur place, pas de livraison.`);
    else if (!ASSIGNABLE.includes(fresh.status)) lines.push(`Commande n°${msg.ref(fresh)} : ${msg.statusLabel(fresh.status)}, elle ne peut pas être confiée.`);
    else {
      const r = fresh.driverId === driver.uid ? { success: true, data: fresh } : await assignDriver(fresh.id, driver.uid, fresh);
      if (r.success) assigned.push(r.data);
      else lines.push(`Commande n°${msg.ref(fresh)} : ${r.message}.`);
    }
  }
  for (const o of assigned) await sendCard(driver.phone, o, fastFood);
  dir.forgetDriver(driver.phone);
  return { assigned, lines };
};

/** Avance la commande pas à pas jusqu'à « en livraison ». null ou le message d'échec. */
const toDelivering = async (order, shop) => {
  const { updateOrders } = require('../../order/updateOrders.service');
  for (let step = RANK[order.status]; step < RANK.delivering; step += 1) {
    // expectedStatus : deux départs croisés ne font jamais passer « livrée » sans QR.
    const r = await updateOrders([{ id: order.id, fastFoodId: order.fastFoodId }], shop.userId, null, { expectedStatus: STATUSES[step] });
    if (!r?.success) return r?.message || 'mise à jour impossible';
  }
  return null;
};

/**
 * Le livreur part avec ses commandes (bouton ou agent IA) : seulement celles qui lui sont
 * confiées, acceptées par la boutique. Le marchand est prévenu, par boutique.
 * @returns {Promise<{ started: object[], lines: string[] }>}
 */
exports.startDelivery = async (driverUser, orders) => {
  const uid = dir.uidOf(driverUser);
  const started = [];
  const lines = [];
  const shops = new Map();
  for (const o of orders) {
    const fresh = await repos.orders.getById(o.id);
    if (!fresh || fresh.driverId !== uid) {
      lines.push(`Commande n°${msg.ref(o)} : elle ne vous est pas confiée.`);
      continue;
    }
    if (fresh.status === 'delivering') {
      lines.push(`Commande n°${msg.ref(fresh)} : déjà en livraison.`);
      continue;
    }
    if (!(fresh.status in RANK) || fresh.status === 'pending') {
      lines.push(`Commande n°${msg.ref(fresh)} : ${msg.statusLabel(fresh.status)}.`);
      continue;
    }
    const shop = shops.get(fresh.fastFoodId) || (await repos.fastfoods.getById(fresh.fastFoodId));
    shops.set(fresh.fastFoodId, shop);
    const failure = await toDelivering(fresh, shop);
    if (failure) lines.push(`Commande n°${msg.ref(fresh)} : ${failure}.`);
    else started.push(fresh);
  }
  const name = dir.nameOf(driverUser);
  for (const shop of shops.values()) {
    const mine = started.filter(o => o.fastFoodId === shop.id);
    const to = mine.length ? await shopPhone(shop) : null;
    if (to) await sendText(to, `Le livreur ${name} est parti avec la commande n°${mine.map(msg.ref).join(', n°')} (livraison en cours).`);
  }
  return { started, lines };
};

/** Bouton « Je pars en livraison » d'une fiche : seul le livreur assigné, depuis son numéro. */
const onGo = async ({ ref, event }) => {
  const order = await repos.orders.getById(ref);
  const driver = order?.driverId ? await repos.users.getUserByIdSafe(order.driverId) : null;
  if (!driver || (await dir.phoneOfUser(driver)) !== event.from) return sendText(event.from, 'Cette commande ne vous est pas confiée.');
  const { started, lines } = await exports.startDelivery(driver, [order]);
  const out = [...lines, ...started.map(o => `Commande n°${msg.ref(o)} : livraison en cours. ${text.QR_LINE}`)];
  if (out.length) await sendText(event.from, out.join('\n\n'));
};

/**
 * Message relayé par l'agent IA (marchand -> livreur ou livreur -> marchand). Référence
 * `relay_<numéro de l'expéditeur>` : refusé hors fenêtre de 24 h, l'expéditeur est prévenu.
 */
exports.relay = (to, from, body) => send({ to, type: 'text', reference: `relay_${String(from).replace(/\D/g, '')}`, text: { body } }, 'Message relayé', 'ai');

const onFailed = async event => {
  if (Number(event.error?.code) !== OUT_OF_WINDOW) return false;
  const reference = event.reference || '';
  if (reference.startsWith('relay_')) {
    await sendText(`+${reference.slice('relay_'.length)}`, "Votre message n'a pas pu être remis : la personne n'a pas écrit à Yaammoo sur WhatsApp depuis plus de 24 h. Appelez-la directement.");
    return true;
  }
  if (!reference.startsWith('drvorder_')) return false;
  // Fiche refusée hors fenêtre : template (boutique, n°, plats, livraison ; bouton Je pars en livraison).
  const order = await repos.orders.getById(reference.slice('drvorder_'.length));
  if (!order || !['processing', 'finished'].includes(order.status)) return false;
  const to = await dir.driverPhoneOfOrder(order);
  if (!to) return false;
  const shop = await repos.fastfoods.getById(order.fastFoodId);
  await send(
    {
      to,
      type: 'template',
      reference: `drvtpl_${order.id}`,
      template: { name: 'yam_livraison_livreur', language: 'fr', bodyParams: [shop?.name || 'Yaammoo', msg.ref(order), msg.plats(order), msg.livraison(order)], buttons: [{ payload: `${order.id}:drv_go` }] },
    },
    `Course ${order.id} (template)`
  );
  return true;
};

exports.registerDriverDeliveryFlows = () => {
  onButton('drv_go', onGo);
  onSendFailed(onFailed);
};
