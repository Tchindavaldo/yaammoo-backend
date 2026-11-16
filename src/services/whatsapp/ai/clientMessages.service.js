// Messages d'une boutique WhatsApp à son client, posés par l'agent IA à la demande du
// marchand (table wa_client_messages, migration 090) : information (« la commande part
// dans 10 min ») ou question (« piment ou pas ? »). Le client reçoit une push + le socket
// `shop.message` (donnée complète, R24) ; il répond depuis l'app
// (POST /shop-messages/:id/answer), la réponse est relayée au marchand sur WhatsApp et
// poussée au client par `shop.messageUpdated`. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { getIO } = require('../../../socket');
const { reliableEmit } = require('../../../utils/reliableEmit');
const { notifyOrderEvent } = require('../../notification/helpers/notifyOrderEvent');
const { shopSender } = require('../../notification/helpers/shopSender');
const msg = require('../merchantMessages');
const { shopPhone, sendText } = require('../merchantChannel');

const preview = text => {
  const line = String(text || '').trim().replace(/\s+/g, ' ');
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
};

/** Forme renvoyée à l'app (GET, sockets) : le message + la boutique qui parle. */
const toClientView = (m, fastFood) => ({
  ...m,
  orderRef: msg.ref({ id: m.orderId }),
  fastFood: fastFood ? { id: fastFood.id, name: fastFood.name, image: fastFood.image || null } : { id: m.fastFoodId },
});

const emit = async (userId, event, data) => {
  try {
    await reliableEmit(getIO(), userId, event, { data });
  } catch (e) {
    console.error(`❌ [WHATSAPP] socket ${event} : ${e.message}`);
  }
};

/**
 * Message de la boutique au client d'une commande. `expectsAnswer` : le client doit répondre.
 * @returns {Promise<object>} le message créé (vue client)
 */
exports.sendToClient = async ({ order, fastFood, text, expectsAnswer }) => {
  const created = await repos.waClientMessages.create({ orderId: order.id, fastFoodId: fastFood.id, userId: order.userId, text, expectsAnswer });
  const view = toClientView(created, fastFood);
  await emit(order.userId, 'shop.message', view);
  await notifyOrderEvent({
    targetUserId: order.userId,
    type: 'ShopMessage',
    title: expectsAnswer ? `${fastFood.name} vous pose une question` : fastFood.name,
    body: preview(text),
    orderId: order.id,
    route: `shop-message/${created.id}`,
    sender: shopSender(fastFood),
  });
  return view;
};

/** Messages reçus par un client (option : une commande), plus récents d'abord. */
exports.listForUser = async (userId, orderId) => {
  const list = await repos.waClientMessages.listByUser(userId, { orderId });
  const shops = new Map();
  for (const id of new Set(list.map(m => m.fastFoodId))) shops.set(id, await repos.fastfoods.getById(id));
  return list.map(m => toClientView(m, shops.get(m.fastFoodId)));
};

/**
 * Réponse du client à une question : enregistrée, relayée au marchand sur WhatsApp
 * (fenêtre de 24 h ouverte par sa demande), poussée au client.
 * @returns {Promise<{ success: boolean, httpStatus?: number, message?: string, data?: object }>}
 */
exports.answer = async (id, userId, answer) => {
  const current = await repos.waClientMessages.getById(id);
  if (!current || current.userId !== userId) return { success: false, httpStatus: 404, message: 'Message introuvable.' };
  if (!current.expectsAnswer) return { success: false, httpStatus: 400, message: "Ce message n'attend pas de réponse." };
  const updated = await repos.waClientMessages.answerIfOpen(id, answer);
  if (!updated) return { success: false, httpStatus: 409, message: 'Question déjà répondue.' };

  const fastFood = await repos.fastfoods.getById(updated.fastFoodId);
  const to = await shopPhone(fastFood);
  if (to) {
    const r = await sendText(to, `Réponse du client (commande n°${msg.ref({ id: updated.orderId })}) à « ${preview(updated.text)} » :\n${answer}`);
    if (!r.ok) console.error(`❌ [WHATSAPP] réponse client ${id} non relayée au marchand (fenêtre de 24 h close ?)`);
  }
  const view = toClientView(updated, fastFood);
  await emit(userId, 'shop.messageUpdated', view);
  return { success: true, data: view };
};
