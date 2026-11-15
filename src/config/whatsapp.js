// Module WhatsApp de rauval-backend : URL, clé API de l'appli « Yaammoo », secret de relais.
// Utilisé par services/whatsapp/*. Doc : architecture/whatsapp.md.
// Lus à chaque appel (jamais figés au démarrage) : un secret Fly changé est pris au redémarrage.

module.exports = {
  /** Base de l'API du module, ex. https://rauval-backend.fly.dev/whatsapp */
  moduleUrl: () => process.env.WHATSAPP_MODULE_URL,
  /** Clé `x-api-key` de l'appli Yaammoo dans le module */
  apiKey: () => process.env.WHATSAPP_API_KEY,
  /** Secret qui signe les événements relayés (`X-Rauval-Signature`) */
  webhookSecret: () => process.env.WHATSAPP_WEBHOOK_SECRET,
};
