// Appel de chat OpenRouter (API compatible OpenAI) avec outils (function calling).
// Les modèles de `settings_app.ai_models` sont passés dans l'ordre : OpenRouter essaie
// le suivant si le premier échoue (paramètre `models`). Utilisé par
// services/whatsapp/ai/merchantAgent.service.js. Doc : architecture/whatsapp-ai.md.
// Ne lève jamais : renvoie { ok, message, model, error }.
const config = require('../../config/openrouter');

/**
 * @param {{ models: string[], messages: object[], tools?: object[], timeoutMs: number }} p
 * @returns {Promise<{ ok: boolean, message?: { content?: string, tool_calls?: object[] }, model?: string, error?: string }>}
 */
exports.chat = async ({ models, messages, tools, timeoutMs }) => {
  const base = config.apiUrl();
  const key = config.apiKey();
  if (!base || !key) {
    console.error('❌ [AI] OPENROUTER_API_URL ou OPENROUTER_API_KEY manquant');
    return { ok: false, error: 'OpenRouter non configuré' };
  }
  if (!models?.length) return { ok: false, error: 'Aucun modèle (settings_app.ai_models)' };
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Yaammoo' },
      body: JSON.stringify({
        models,
        messages,
        ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data?.error?.message || `HTTP ${res.status}`;
      console.error(`❌ [AI] OpenRouter : ${error}`);
      return { ok: false, error };
    }
    const message = data?.choices?.[0]?.message;
    if (!message) return { ok: false, error: 'Réponse OpenRouter vide' };
    return { ok: true, message, model: data.model };
  } catch (e) {
    console.error(`❌ [AI] OpenRouter : ${e.message}`);
    return { ok: false, error: e.message };
  }
};
