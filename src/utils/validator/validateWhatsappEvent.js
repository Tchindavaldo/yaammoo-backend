// Validation d'un événement relayé par le module WhatsApp (POST /whatsapp/webhook).
// Champs requis et types connus vérifiés ; un champ inconnu est TOLÉRÉ (pas d'erreur) :
// le module peut ajouter des champs sans casser la réception.
const {
  WHATSAPP_EVENTS,
  whatsappMessageEventFields,
  whatsappStatusEventFields,
} = require('../../interface/whatsappWebhookFields');

/** @returns {{ field: string, message: string }[]} */
module.exports = function validateWhatsappEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return [{ field: 'body', message: 'Événement JSON attendu' }];
  }
  if (!WHATSAPP_EVENTS.includes(event.event)) {
    return [{ field: 'event', message: `event : ${WHATSAPP_EVENTS.join(', ')}` }];
  }
  const fields = event.event === 'message' ? whatsappMessageEventFields : whatsappStatusEventFields;
  const errors = [];
  for (const field in fields) {
    const rules = fields[field];
    const value = event[field];
    if (value === undefined || value === '' || (value === null && !rules.nullable)) {
      if (rules.required) errors.push({ field, message: `Champ requis manquant : ${field}` });
      continue;
    }
    if (value === null) continue;
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== rules.type) {
      errors.push({ field, message: `Type invalide pour "${field}": attendu "${rules.type}", reçu "${actual}"` });
    }
  }
  return errors;
};
