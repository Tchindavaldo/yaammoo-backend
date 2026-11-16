// Boucle commune des agents IA WhatsApp (marchand : merchantAgent.service, livreur :
// driverAgent.service) : modèle -> outils (6 tours max) -> réponse finale en message libre,
// et file d'attente par numéro. Doc : architecture/whatsapp-ai.md.
const { chat } = require('../../ai/openrouter.client');
const { sendText } = require('../merchantChannel');

// Tours modèle -> outils au plus par message reçu (garde-fou contre une boucle).
const MAX_ROUNDS = 6;

/**
 * Fait répondre le modèle à `messages` (système + historique) avec les outils `tools`
 * ({ definitions, run(ctx, name, args) }). Un outil qui a déjà écrit à l'interlocuteur pose
 * `ctx.flags.replied` : le message de repli n'est alors pas envoyé.
 */
exports.converse = async ({ event, ctx, messages, tools, ai, fallback }) => {
  if (messages[messages.length - 1]?.role !== 'user') messages.push({ role: 'user', content: event.text });
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const r = await chat({ models: ai.models, messages, tools: tools.definitions, timeoutMs: ai.timeoutMs });
    if (!r.ok) {
      if (!ctx.flags.replied) await sendText(event.from, fallback);
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
  if (!ctx.flags.replied) await sendText(event.from, fallback);
};

/** Exécute un appel d'outil avec les `handlers` donnés. Renvoie toujours un objet (erreur comprise). */
exports.runTool = async (handlers, ctx, name, rawArgs) => {
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

/** Définition d'un outil (function calling). */
exports.fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

// Un message à la fois par numéro : les réponses gardent l'ordre de la conversation.
// Plusieurs messages envoyés d'affilée : seul le DERNIER déclenche une réponse (il voit
// les précédents dans l'historique), les autres sont sautés.
const queues = new Map();
const latest = new Map();
exports.enqueue = (phone, messageId, task) => {
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
