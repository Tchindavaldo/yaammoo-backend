// Événements relayés par le module WhatsApp (messages reçus, statuts) : signature et aiguillage.
// Utilisé par controllers/whatsapp/webhook.controller.js. Un flux marchand s'abonne à une
// action de bouton avec onButton() (todo/fastfood/feature/whatsapp-commandes-marchand.md).
const crypto = require('crypto');
const config = require('../../config/whatsapp');

// Un événement plus ancien est refusé : une requête interceptée ne peut pas être rejouée.
const MAX_AGE_SEC = 300;

/**
 * X-Rauval-Signature = "sha256=" + HMAC-SHA256(secret, `${X-Rauval-Timestamp}.${corps brut}`).
 * @returns {boolean}
 */
exports.verifySignature = (rawBody, timestamp, signature) => {
  const secret = config.webhookSecret();
  if (!secret) {
    console.error('❌ [WHATSAPP] WHATSAPP_WEBHOOK_SECRET manquant : événements refusés');
    return false;
  }
  if (!rawBody || !timestamp || typeof signature !== 'string') return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SEC) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Payload d'un bouton : `<ref>:<action>` (ex. `<orderId>:accept`), posé par l'appli à l'envoi.
const buttonHandlers = new Map();

/** Abonne un flux à une action de bouton : fn({ ref, action, event }) -> Promise. */
exports.onButton = (action, fn) => {
  buttonHandlers.set(action, fn);
};

const parseButton = id => {
  const i = typeof id === 'string' ? id.lastIndexOf(':') : -1;
  return i > 0 ? { ref: id.slice(0, i), action: id.slice(i + 1) } : null;
};

// Messages texte : chaque flux abonné essaie à son tour ; fn(event) -> true s'il l'a traité.
const textHandlers = [];

/** Abonne un flux aux messages texte (ex. « LIVRÉ <id> <code> » du marchand). */
exports.onText = fn => {
  textHandlers.push(fn);
};

async function handleMessage(event) {
  const btn = event.button?.id ? parseButton(event.button.id) : null;
  if (!btn) {
    if (event.type === 'text' && event.text) {
      for (const fn of textHandlers) if (await fn(event)) return { handled: true };
    }
    console.log(`[WHATSAPP] Message ${event.type} de ${event.from} (${event.messageId})`);
    return { handled: false };
  }
  const handler = buttonHandlers.get(btn.action);
  if (!handler) {
    console.warn(`⚠️ [WHATSAPP] Bouton « ${event.button.id} » de ${event.from} : aucun flux abonné à « ${btn.action} »`);
    return { handled: false };
  }
  await handler({ ...btn, event });
  return { handled: true };
}

function handleStatus(event) {
  if (event.status === 'failed') {
    console.error(`❌ [WHATSAPP] Échec d'envoi ${event.wamid} vers ${event.to} (réf. ${event.reference || '-'}) : ${event.error?.message || 'inconnu'}`);
  }
  return { handled: true };
}

/** Traite un événement déjà validé. Une erreur d'un flux remonte au controller (500). */
exports.handleEvent = event => (event.event === 'message' ? handleMessage(event) : handleStatus(event));
