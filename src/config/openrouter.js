// OpenRouter (agent IA des boutiques WhatsApp) : URL de l'API et clé.
// Utilisé par services/ai/openrouter.client.js. Doc : architecture/whatsapp-ai.md.
// Lus à chaque appel (jamais figés au démarrage) : un secret Fly changé est pris au redémarrage.

module.exports = {
  /** Base de l'API, ex. https://openrouter.ai/api/v1 */
  apiUrl: () => process.env.OPENROUTER_API_URL,
  /** Clé `Authorization: Bearer` du compte OpenRouter */
  apiKey: () => process.env.OPENROUTER_API_KEY,
};
