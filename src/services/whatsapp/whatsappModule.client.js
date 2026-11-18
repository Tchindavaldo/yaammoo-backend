// Appels sortants vers le module WhatsApp de rauval-backend (envoi, accusé de lecture, média reçu, numéro).
// Utilisé par services/whatsapp/merchantOrders.service.js et services/order/deliveryLink.service.js.
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

/**
 * Fixe ces numéros (E.164) sur la clé de CE backend (PUT /contact-routes du module,
 * migration 007 de rauval-backend) : leurs messages sans citation lui arrivent toujours,
 * même si l'autre backend (prod / test, même numéro WhatsApp) leur a écrit en dernier.
 */
exports.setContactRoutes = contacts => call('PUT', '/contact-routes', { contacts });

/** Coches bleues sur un message reçu (id Rauval ou wamid), `typing` = indicateur de saisie. */
exports.markRead = (messageId, typing = false) => call('POST', `/messages/${encodeURIComponent(messageId)}/read`, { typing });

/**
 * Télécharge un média reçu par l'appli (GET /media/:id du module) : photo envoyée par un
 * marchand (carte du menu, photo d'un plat). Ne lève jamais : { ok, buffer, mimeType }.
 */
exports.downloadMedia = async mediaId => {
  const base = config.moduleUrl();
  const key = config.apiKey();
  if (!base || !key) return { ok: false, buffer: null, mimeType: null };
  try {
    const res = await fetch(`${base}/media/${encodeURIComponent(mediaId)}`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(await getWhatsappTimeoutMs()) });
    if (!res.ok) {
      console.warn(`⚠️ [WHATSAPP] GET /media/${mediaId} : HTTP ${res.status}`);
      return { ok: false, buffer: null, mimeType: null };
    }
    return { ok: true, buffer: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') || 'application/octet-stream' };
  } catch (e) {
    console.error(`❌ [WHATSAPP] GET /media/${mediaId} : ${e.message}`);
    return { ok: false, buffer: null, mimeType: null };
  }
};

// Numéro WhatsApp de l'appli Yaammoo, gardé 1 h : il change seulement quand le module en attribue un autre.
let myNumber = { phone: null, at: 0 };
/** Numéro E.164 de l'appli dans le module (ex. +15557624938), null si indisponible. */
exports.myPhone = async () => {
  if (myNumber.phone && Date.now() - myNumber.at < 3600e3) return myNumber.phone;
  const r = await call('GET', '/me');
  if (r.ok && r.data?.number?.phone) myNumber = { phone: r.data.number.phone, at: Date.now() };
  return myNumber.phone;
};
