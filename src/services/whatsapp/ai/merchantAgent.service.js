// Agent IA des boutiques WhatsApp (OpenRouter). Un message texte libre du numéro d'une
// boutique (fenêtre de 24 h ouverte par ce message) est traité par le modèle, qui voit
// toute la conversation récente, les commandes et les livreurs de la boutique, appelle les
// outils (agentTools.js, merchantDriverTools.js) puis répond. Les boutons, « LIVRÉ <id>
// <code> » et les templates restent gérés par merchantOrders / merchantTemplates : l'agent ne
// prend que ce qu'ils ne prennent pas. Le livreur a son propre agent (driverAgent.service).
// Enregistré par merchantOrders.registerMerchantOrderButtons. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { onText, onInbound, onMedia } = require('../webhookEvents.service');
const { getAiSettings } = require('../../settings/settings.service');
const wa = require('../whatsappModule.client');
const { shopsOfPhone } = require('../merchantChannel');
const { logInbound } = require('../conversationLog');
const { loadShopOrders } = require('./agentOrders');
const { systemPrompt, historyMessages } = require('./agentPrompt');
const tools = require('./agentTools');
const { converse, enqueue } = require('./agentLoop');
const { registerAiButtons } = require('./pendingActions.service');
const { onVoiceNote } = require('./voiceNotes');

const FALLBACK = "Je n'ai pas pu traiter votre message pour le moment. Utilisez les boutons des messages de commande, ou réessayez dans un instant.";

/** Contexte d'un tour : boutiques, commandes chargées d'office (vue marchand), rechargeable après une action. */
const buildCtx = async (phone, shops, ai) => {
  const ctx = { phone, shops, orders: [], views: [], flags: {}, pageSize: ai.ordersPageSize };
  ctx.reload = async () => {
    const { raw, views } = await loadShopOrders(shops, ai.ordersWindowDays);
    ctx.orders = raw;
    ctx.views = views;
  };
  await ctx.reload();
  return ctx;
};

/** Messages envoyés au modèle : système (consignes + état) puis historique de la conversation. */
const buildMessages = async (ctx, ai) => {
  const sinceIso = new Date(Date.now() - ai.retentionDays * 864e5).toISOString();
  const [history, pending] = await Promise.all([repos.waConversations.listByPhone(ctx.phone, { sinceIso, limit: ai.historyMax }), repos.waAiPendingActions.openByPhone(ctx.phone)]);
  return [{ role: 'system', content: systemPrompt({ shops: ctx.shops, views: ctx.views, pending, pageSize: ctx.pageSize }) }, ...historyMessages(history)];
};

/** Un message du marchand : boucle modèle / outils, puis réponse finale sur WhatsApp. */
const runAgent = async (event, shops, ai) => {
  await wa.markRead(event.messageId, true); // coches bleues + « en train d'écrire »
  const ctx = await buildCtx(event.from, shops, ai);
  const messages = await buildMessages(ctx, ai);
  await converse({ event, ctx, messages, tools, ai, fallback: FALLBACK });
};

/**
 * Texte libre reçu : pris par l'agent si l'IA est active et que le numéro est celui d'une
 * boutique WhatsApp. Traité en arrière-plan (le module reçoit son 200 sans attendre le modèle).
 */
const onMerchantText = async event => {
  const ai = await getAiSettings();
  if (!ai.enabled) return false;
  const shops = await shopsOfPhone(event.from);
  if (!shops.length) return false;
  enqueue(event.from, event.messageId, () => runAgent(event, shops, ai));
  return true;
};

/** Journal de conversation, boutons Confirmer / Annuler, l'agent (avant celui du livreur), notes vocales. */
exports.registerMerchantAgent = () => {
  onInbound(logInbound);
  registerAiButtons();
  onText(onMerchantText);
  onMedia(onVoiceNote); // note vocale du marchand ou du livreur : « écrivez » (voiceNotes.js)
};
