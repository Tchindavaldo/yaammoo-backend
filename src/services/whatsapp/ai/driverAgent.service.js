// Agent IA des LIVREURS des boutiques WhatsApp (OpenRouter). Un texte libre du numéro d'un
// livreur rattaché à une boutique WhatsApp (driver/driverDirectory) est traité par le
// modèle : il voit la conversation et les commandes confiées au livreur, appelle les outils
// (driverTools.js) et répond. Un numéro de boutique reste à l'agent du marchand.
// Enregistré par merchantOrders.registerMerchantOrderButtons, APRÈS l'agent du marchand.
// Doc : architecture/whatsapp-ai.md (« Livreurs »).
const repos = require('../../../repositories');
const { onText } = require('../webhookEvents.service');
const { getAiSettings } = require('../../settings/settings.service');
const wa = require('../whatsappModule.client');
const { shopsOfPhone } = require('../merchantChannel');
const dir = require('../driver/driverDirectory');
const { loadDriverOrders } = require('./agentOrders');
const { historyMessages } = require('./agentPrompt');
const { driverSystemPrompt } = require('./driverPrompt');
const tools = require('./driverTools');
const { converse, enqueue } = require('./agentLoop');

const FALLBACK = "Je n'ai pas pu traiter votre message pour le moment. Utilisez les boutons des fiches de commande, ou réessayez dans un instant.";

const buildCtx = async (phone, driver, ai) => {
  const uid = dir.uidOf(driver.user);
  const ctx = { phone, user: driver.user, uid, shops: driver.shops, orders: [], views: [], payoutReady: await dir.hasPayoutNumber(uid), flags: {}, pageSize: ai.ordersPageSize };
  ctx.reload = async () => {
    const { raw, views } = await loadDriverOrders(uid, driver.shops);
    ctx.orders = raw;
    ctx.views = views;
  };
  await ctx.reload();
  return ctx;
};

const runAgent = async (event, driver, ai) => {
  await wa.markRead(event.messageId, true);
  const ctx = await buildCtx(event.from, driver, ai);
  const sinceIso = new Date(Date.now() - ai.retentionDays * 864e5).toISOString();
  const history = await repos.waConversations.listByPhone(ctx.phone, { sinceIso, limit: ai.historyMax });
  const system = driverSystemPrompt({ name: dir.nameOf(ctx.user), shops: ctx.shops, views: ctx.views, payoutReady: ctx.payoutReady, pageSize: ctx.pageSize });
  await converse({ event, ctx, messages: [{ role: 'system', content: system }, ...historyMessages(history)], tools, ai, fallback: FALLBACK });
};

/** Texte libre d'un livreur de boutique WhatsApp (pas d'un numéro de boutique) : traité en arrière-plan. */
const onDriverText = async event => {
  const ai = await getAiSettings();
  if (!ai.enabled) return false;
  if ((await shopsOfPhone(event.from)).length) return false;
  const driver = await dir.driverOfPhone(event.from);
  if (!driver) return false;
  enqueue(event.from, event.messageId, () => runAgent(event, driver, ai));
  return true;
};

exports.registerDriverAgent = () => {
  onText(onDriverText);
};
