// Agent IA des boutiques WhatsApp (OpenRouter). Un message texte libre du numéro d'une
// boutique (fenêtre de 24 h ouverte par ce message) est traité par le modèle, qui voit
// toute la conversation récente et les commandes de la boutique, appelle les outils
// (agentTools.js) puis répond. Les boutons, « LIVRÉ <id> <code> » et les templates restent
// gérés par merchantOrders / merchantTemplates : l'agent ne prend que ce qu'ils ne prennent pas.
// Enregistré par merchantOrders.registerMerchantOrderButtons. Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const { onText, onInbound } = require('../webhookEvents.service');
const { getAiSettings } = require('../../settings/settings.service');
const { chat } = require('../../ai/openrouter.client');
const wa = require('../whatsappModule.client');
const { shopsOfPhone, sendText } = require('../merchantChannel');
const { logInbound } = require('../conversationLog');
const { loadShopOrders } = require('./agentOrders');
const { systemPrompt, historyMessages } = require('./agentPrompt');
const tools = require('./agentTools');
const { registerAiButtons } = require('./pendingActions.service');

// Tours modèle -> outils au plus par message reçu (garde-fou contre une boucle).
const MAX_ROUNDS = 6;
const FALLBACK = "Je n'ai pas pu traiter votre message pour le moment. Utilisez les boutons des messages de commande, ou réessayez dans un instant.";

/** Contexte d'un tour : boutiques, commandes (vue marchand), rechargeable après une action. */
const buildCtx = async (phone, shops, ai) => {
  const ctx = { phone, shops, orders: [], views: [], flags: {} };
  ctx.reload = async () => {
    const { raw, views } = await loadShopOrders(shops, ai.retentionDays);
    ctx.orders = raw;
    ctx.views = views;
  };
  await ctx.reload();
  return ctx;
};

/** Messages envoyés au modèle : système (consignes + état) puis historique de la conversation. */
const buildMessages = async (ctx, ai) => {
  const sinceIso = new Date(Date.now() - ai.retentionDays * 864e5).toISOString();
  const [history, pending, clientMessages] = await Promise.all([
    repos.waConversations.listByPhone(ctx.phone, { sinceIso, limit: ai.historyMax }),
    repos.waAiPendingActions.openByPhone(ctx.phone),
    repos.waClientMessages.listByOrders(ctx.orders.map(o => o.id)),
  ]);
  return [{ role: 'system', content: systemPrompt({ shops: ctx.shops, views: ctx.views, pending, clientMessages }) }, ...historyMessages(history)];
};

/** Un message du marchand : boucle modèle / outils, puis réponse finale sur WhatsApp. */
const runAgent = async (event, shops, ai) => {
  await wa.markRead(event.messageId, true); // coches bleues + « en train d'écrire »
  const ctx = await buildCtx(event.from, shops, ai);
  const messages = await buildMessages(ctx, ai);
  if (messages[messages.length - 1]?.role !== 'user') messages.push({ role: 'user', content: event.text });

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const r = await chat({ models: ai.models, messages, tools: tools.definitions, timeoutMs: ai.timeoutMs });
    if (!r.ok) {
      if (!ctx.flags.sentToMerchant) await sendText(event.from, FALLBACK);
      return;
    }
    const calls = r.message.tool_calls || [];
    if (!calls.length) {
      const text = String(r.message.content || '').trim();
      if (text) await sendText(event.from, text, 'ai');
      return;
    }
    messages.push({ role: 'assistant', content: r.message.content || '', tool_calls: calls });
    for (const call of calls) {
      const result = await tools.run(ctx, call.function?.name, call.function?.arguments);
      console.log(`[AI] ${event.from} · ${call.function?.name} (${r.model}) -> ${result.error ? `erreur : ${result.error}` : 'ok'}`);
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function?.name, content: JSON.stringify(result) });
    }
  }
  console.warn(`⚠️ [AI] ${event.from} : ${MAX_ROUNDS} tours sans réponse finale`);
  if (!ctx.flags.sentToMerchant) await sendText(event.from, FALLBACK);
};

// Un message à la fois par numéro : les réponses gardent l'ordre de la conversation.
// Plusieurs messages envoyés d'affilée : seul le DERNIER déclenche une réponse (il voit
// les précédents dans l'historique), les autres sont sautés.
const queues = new Map();
const latest = new Map();
const enqueue = (phone, messageId, task) => {
  latest.set(phone, messageId);
  const run = () => (latest.get(phone) === messageId ? task() : null);
  const prev = queues.get(phone) || Promise.resolve();
  const next = prev.then(run).catch(e => console.error(`❌ [AI] agent ${phone} : ${e.message}`));
  queues.set(phone, next);
  next.finally(() => {
    if (queues.get(phone) !== next) return;
    queues.delete(phone);
    latest.delete(phone);
  });
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

/** Journal de conversation, boutons Confirmer / Annuler, puis l'agent (DERNIER flux texte). */
exports.registerMerchantAgent = () => {
  onInbound(logInbound);
  registerAiButtons();
  onText(onMerchantText);
};
