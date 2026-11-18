// Notes vocales WhatsApp d'une boutique, d'un livreur ou d'un super-administrateur (migration
// 099, décisions du 18/11/2026). La note est téléchargée, sa durée contrôlée
// (`ai_audio_max_seconds`), puis transcrite par les modèles qui écoutent (`ai_audio_models`,
// un par un, services/ai/transcribeAudio.js). Bien entendue (le modèle répond « DOUTE: non »),
// elle part tout de suite à l'agent. En cas de doute seulement (décision du 18/11/2026),
// Yaammoo renvoie « J'ai compris : … » avec Confirmer / Corriger ; confirmée, la transcription est traitée par l'agent comme un message
// écrit (webhookEvents.dispatchText). Journal : « [vocal à confirmer] … », puis « [vocal] … »
// ou « [vocal rejeté] … ». Enregistré par merchantAgent.registerMerchantAgent.
// Doc : architecture/whatsapp-ai.md (« Notes vocales »).
const repos = require('../../../repositories');
const { getAiSettings } = require('../../settings/settings.service');
const { transcribeAudio } = require('../../ai/transcribeAudio');
const oggOpusSeconds = require('../../../utils/oggOpusSeconds');
const wa = require('../whatsappModule.client');
const { onMedia, onButton, dispatchText } = require('../webhookEvents.service');
const { shopsOfPhone, send, sendText } = require('../merchantChannel');
const dir = require('../driver/driverDirectory');
const { isAdminPhone } = require('../admin/adminAlerts.service');

const VOICE_TYPES = new Set(['audio', 'voice']);
const MAX_BYTES = 5 * 1024 * 1024;
// Format autre que Ogg Opus (durée illisible) : au plus 32 ko par seconde (256 kbit/s).
const BYTES_PER_SECOND_MAX = 32000;
const MAX_SHOWN = 850; // caractères de la transcription dans le message à boutons (1024 max chez Meta)

const TAG = {
  pending: '[vocal à confirmer]',
  done: '[vocal]',
  rejected: '[vocal rejeté]',
  unheard: '[vocal non compris]',
  long: '[vocal trop long, non écouté]',
};

const PROMPT = `Tu transcris une note vocale WhatsApp envoyée à Yaammoo (commande de repas au Cameroun) par un restaurant, un livreur ou un administrateur.
- Écris exactement ce qui est dit, dans la langue parlée (français, anglais, pidgin camerounais), sans corriger le sens, sans résumer et sans répondre au message.
- Noms de plats, quartiers, numéros de commande, montants et numéros de téléphone : tels qu'entendus, nombres en chiffres.
- Passage dans une autre langue (langue locale) : transcris-le, puis ajoute sa traduction en français entre parenthèses.
- Passage inaudible : [inaudible]. Rien de compréhensible : réponds seulement [inaudible].
Réponds par la transcription seule, puis, sur une DERNIÈRE ligne à part, « DOUTE: oui » ou « DOUTE: non ».
« DOUTE: oui » seulement si tu n'es pas sûr de ce qui a été dit : passage mal entendu ou [inaudible], ou un mot dont dépend le sens (nom de plat, quartier, numéro de commande, montant, téléphone, oui / non, annuler / valider) que tu as pu mal comprendre. Sinon « DOUTE: non ».`;

const WRITE = "Merci d'écrire votre message : les notes vocales ne sont pas lues.";
const UNHEARD = "Je n'ai pas compris votre note vocale. Renvoyez-la, ou écrivez votre message.";
const FAILED = "Je n'ai pas pu écouter votre note vocale pour le moment. Réessayez dans un instant, ou écrivez votre message.";
const DONE_ALREADY = 'Cette note vocale a déjà été traitée.';

/** 75 -> « 1 min 15 s », 60 -> « 1 min », 45 -> « 45 s ». */
const duration = seconds => {
  const t = Math.round(seconds);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`;
};

/** Numéro d'un super-administrateur, d'une boutique WhatsApp ou d'un de ses livreurs. */
const known = async phone => (await isAdminPhone(phone)) || (await shopsOfPhone(phone)).length > 0 || !!(await dir.driverOfPhone(phone));

/** Remplace « [audio] » de la ligne du journal par `tag` (+ texte). false si la ligne manque. */
const retag = async (event, tag, text = '') => {
  const row = await repos.waConversations.getByMessageId(event.messageId);
  if (!row) return false;
  await repos.waConversations.setBodyByMessageId(event.messageId, row.body.replace(`[${event.type}]`, text ? `${tag} ${text}` : tag));
  return true;
};

/** Écoute la note : durée, transcription, puis « J'ai compris : … » avec Confirmer / Corriger. */
const listen = async (event, ai) => {
  await wa.markRead(event.messageId, true).catch(() => {});
  if (!ai.audioModels.length || !ai.audioMaxSeconds) return sendText(event.from, WRITE);
  const dl = await wa.downloadMedia(event.media?.id);
  if (!dl.ok || !String(dl.mimeType).startsWith('audio/')) {
    console.warn(`⚠️ [AI] note vocale ${event.messageId} de ${event.from} : téléchargement impossible ou fichier refusé (${dl.mimeType})`);
    return sendText(event.from, FAILED);
  }
  const exact = oggOpusSeconds(dl.buffer);
  const tooLong = dl.buffer.length > MAX_BYTES || (exact != null ? exact > ai.audioMaxSeconds : dl.buffer.length > ai.audioMaxSeconds * BYTES_PER_SECOND_MAX);
  if (tooLong) {
    await retag(event, TAG.long);
    const what = exact != null ? `dure ${duration(exact)}` : 'est trop longue';
    return sendText(event.from, `Votre note vocale ${what} : j'écoute au plus ${duration(ai.audioMaxSeconds)}. Envoyez-en une plus courte, ou écrivez votre message.`);
  }
  const r = await transcribeAudio({ models: ai.audioModels, buffer: dl.buffer, mimeType: dl.mimeType, prompt: PROMPT, timeoutMs: ai.timeoutMs });
  if (!r.ok) {
    console.error(`❌ [AI] note vocale ${event.messageId} de ${event.from} : ${r.error}`);
    return sendText(event.from, FAILED);
  }
  // Dernière ligne « DOUTE: oui|non » (absente = doute) : confirmation seulement en cas de doute.
  const doubtLine = r.text.match(/DOUTE\s*:\s*(oui|non)\s*$/i);
  const doubt = !doubtLine || doubtLine[1].toLowerCase() === 'oui';
  const text = (doubtLine ? r.text.slice(0, doubtLine.index) : r.text).replace(/\s+/g, ' ').trim();
  if (!text || /^\[?inaudible\]?\.?$/i.test(text)) {
    await retag(event, TAG.unheard);
    return sendText(event.from, UNHEARD);
  }
  const unsure = doubt || /\[inaudible\]/i.test(text);
  console.log(`[AI] note vocale ${event.messageId} de ${event.from} transcrite par ${r.model} (${exact != null ? `${exact.toFixed(1)} s` : 'durée inconnue'}, ${unsure ? 'doute : confirmation' : 'sûre'})`);
  // Bien entendue : traitée tout de suite par l'agent, comme un message écrit.
  if (!unsure) {
    if (!(await retag(event, TAG.done, text))) return sendText(event.from, FAILED);
    const handled = await dispatchText({ event: 'message', from: event.from, messageId: event.messageId, type: 'text', text, timestamp: event.timestamp });
    if (!handled) console.warn(`⚠️ [AI] note vocale ${event.messageId} de ${event.from} : aucun agent ne l'a prise (IA coupée ?)`);
    return null;
  }
  if (!(await retag(event, TAG.pending, text))) return sendText(event.from, FAILED);
  const shown = text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text;
  return send(
    {
      to: event.from,
      type: 'interactive',
      reference: `voice_${event.messageId}`,
      interactive: {
        kind: 'buttons',
        body: `J'ai compris :\n« ${shown} »\n\nC'est bien ça ?`,
        buttons: [
          { id: `${event.messageId}:vo_yes`, title: 'Confirmer' },
          { id: `${event.messageId}:vo_no`, title: 'Corriger' },
        ],
      },
    },
    `Note vocale ${event.messageId}`,
    'ai'
  );
};

/** Note vocale reçue d'un numéro connu, IA active : écoutée en arrière-plan. */
const onVoiceNote = async event => {
  if (!VOICE_TYPES.has(event.type)) return false;
  const ai = await getAiSettings();
  if (!ai.enabled || !(await known(event.from))) return false;
  listen(event, ai).catch(e => console.error(`❌ [AI] note vocale ${event.messageId} de ${event.from} : ${e.message}`));
  return true;
};

/** Ligne du journal d'une note encore à confirmer, envoyée par CE numéro ; null sinon. */
const pendingRow = async (ref, phone) => {
  const row = await repos.waConversations.getByMessageId(ref);
  return row && row.phone === phone && row.direction === 'in' && row.body.includes(TAG.pending) ? row : null;
};

/** Confirmer : la transcription part à l'agent, comme un message écrit (une seule fois). */
const onConfirm = async ({ ref, event }) => {
  const row = await pendingRow(ref, event.from);
  if (!row) return sendText(event.from, DONE_ALREADY);
  if (!(await repos.waConversations.swapBodyByMessageId(ref, row.body, row.body.replace(TAG.pending, TAG.done)))) return null;
  const text = row.body.slice(row.body.indexOf(TAG.pending) + TAG.pending.length).trim();
  const handled = await dispatchText({ event: 'message', from: event.from, messageId: event.messageId, type: 'text', text, timestamp: event.timestamp });
  if (!handled) console.warn(`⚠️ [AI] note vocale ${ref} de ${event.from} confirmée : aucun agent ne l'a prise (IA coupée ?)`);
  return null;
};

/** Corriger : la transcription est écartée, la personne renvoie son message. */
const onCorrect = async ({ ref, event }) => {
  const row = await pendingRow(ref, event.from);
  if (!row) return sendText(event.from, DONE_ALREADY);
  if (!(await repos.waConversations.swapBodyByMessageId(ref, row.body, row.body.replace(TAG.pending, TAG.rejected)))) return null;
  return sendText(event.from, "D'accord. Renvoyez votre note vocale, ou écrivez votre message.");
};

exports.registerVoiceNotes = () => {
  onMedia(onVoiceNote);
  onButton('vo_yes', onConfirm);
  onButton('vo_no', onCorrect);
};
