// Notes vocales du marchand ou du livreur d'une boutique WhatsApp : les modèles de l'agent
// IA ne lisent pas l'audio (décision du 17/11/2026 : pas de transcription pour l'instant).
// Réponse fixe qui demande d'écrire, sans appel au modèle (aucun coût). Le message reste
// journalisé (`[audio]`, conversationLog). Doc : architecture/whatsapp-ai.md.
const { getAiSettings } = require('../../settings/settings.service');
const wa = require('../whatsappModule.client');
const { shopsOfPhone, sendText } = require('../merchantChannel');
const dir = require('../driver/driverDirectory');

const VOICE_TYPES = new Set(['audio', 'voice']);
const REPLY = "Merci d'écrire votre message : les notes vocales ne sont pas lues.";

/** Message reçu non texte : true s'il s'agit d'une note vocale d'un marchand ou d'un livreur. */
const onVoiceNote = async event => {
  if (!VOICE_TYPES.has(event.type)) return false;
  const ai = await getAiSettings();
  if (!ai.enabled) return false;
  const known = (await shopsOfPhone(event.from)).length > 0 || !!(await dir.driverOfPhone(event.from));
  if (!known) return false;
  await wa.markRead(event.messageId).catch(() => {});
  await sendText(event.from, REPLY);
  return true;
};

module.exports = { onVoiceNote, VOICE_REPLY: REPLY };
