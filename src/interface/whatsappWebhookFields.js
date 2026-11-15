// interface/whatsappWebhookFields.js
// Événements relayés par le module WhatsApp de rauval-backend vers POST /whatsapp/webhook.
// Contrat du module : rauval-backend/architecture/whatsapp.md (« Relais vers l'appli »).

/** Types d'événement (en-tête X-Rauval-Event et champ `event`). */
exports.WHATSAPP_EVENTS = ['message', 'status'];

/** event = 'message' : message reçu d'un contact. */
exports.whatsappMessageEventFields = {
  event: { type: 'string', required: true },
  messageId: { type: 'string', required: true }, // id Rauval du message
  wamid: { type: 'string', required: true }, // id WhatsApp
  from: { type: 'string', required: true }, // E.164, ex. +237611111111
  name: { type: 'string', required: false, nullable: true }, // nom WhatsApp du contact
  type: { type: 'string', required: true }, // text, button, interactive, image, audio, location, reaction…
  timestamp: { type: 'string', required: false },
  text: { type: 'string', required: false, nullable: true },
  // Bouton de template ou bouton / ligne de liste interactif : { id, title } ; id = payload posé à l'envoi.
  button: { type: 'object', required: false, nullable: true },
  // Message cité : { wamid, messageId, reference } ; reference = celle posée à l'envoi (ex. order_101).
  replyTo: { type: 'object', required: false, nullable: true },
  media: { type: 'object', required: false, nullable: true }, // { id, mimeType, caption?, filename? }
  location: { type: 'object', required: false, nullable: true },
  reaction: { type: 'object', required: false, nullable: true },
  raw: { type: 'object', required: false }, // message Meta brut
};

/** event = 'status' : suivi d'un message envoyé. */
exports.whatsappStatusEventFields = {
  event: { type: 'string', required: true },
  messageId: { type: 'string', required: false, nullable: true },
  wamid: { type: 'string', required: true },
  reference: { type: 'string', required: false, nullable: true },
  to: { type: 'string', required: false, nullable: true },
  status: { type: 'string', required: true }, // sent, delivered, read, failed
  timestamp: { type: 'string', required: false },
  error: { type: 'object', required: false, nullable: true }, // { code, message, ... } si failed
  pricing: { type: 'object', required: false, nullable: true },
};
