// Appels sortants vers le module WhatsApp de rauval-backend (envoi, accusé de lecture).
// Utilisé par les futurs flux marchands (todo/fastfood/feature/whatsapp-commandes-marchand.md).
// Ne lève jamais : renvoie { ok, status, data } ; un échec est journalisé.
const config = require('../../config/whatsapp');
const { getWhatsappTimeoutMs } = require('../settings/settings.service');

async function call(method, path, body) {
  const base = config.moduleUrl();
  const key = config.apiKey();
  if (!base || !key) {
    console.error('❌ [WHATSAPP] WHATSAPP_MODULE_URL ou WHATSAPP_API_KEY manquant');
    return { ok: false, status: 0, data: { message: 'Module WhatsApp non configuré' } };
  }
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(await getWhatsappTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.warn(`⚠️ [WHATSAPP] ${method} ${path} : HTTP ${res.status} ${data.message || ''}`);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error(`❌ [WHATSAPP] ${method} ${path} : ${e.message}`);
    return { ok: false, status: 0, data: { message: e.message } };
  }
}

/**
 * Envoi d'un message (même corps que POST /whatsapp/messages du module) :
 * { to, type, reference?, replyTo?, text | template | image | interactive | ... }
 * Réponse du module : { success, messageId, wamid, status }.
 */
exports.sendMessage = body => call('POST', '/messages', body);

/** Coches bleues sur un message reçu (id Rauval ou wamid), `typing` = indicateur de saisie. */
exports.markRead = (messageId, typing = false) => call('POST', `/messages/${encodeURIComponent(messageId)}/read`, { typing });
