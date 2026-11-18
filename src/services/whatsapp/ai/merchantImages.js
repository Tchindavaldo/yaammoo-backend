// Photos envoyées par le marchand d'une boutique WhatsApp (carte du menu, photo d'un plat),
// migration 097 : téléchargées depuis le module, rangées dans le storage, adresse ajoutée au
// journal (« [image https://…] ») puis montrées au modèle de l'agent IA
// (merchantAgent.service). L'agent les pose sur un plat avec set_menu_photo.
// Doc : architecture/whatsapp-ai.md.
const repos = require('../../../repositories');
const wa = require('../whatsappModule.client');

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TO_MODEL = 4; // photos montrées au modèle par réponse
const IMAGE_RE = /\[image (https?:\/\/[^\s\]]+)\]/g;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Téléchargements en cours par numéro : l'agent les attend avant de lire le journal.
const inflight = new Map();

/** Adresses d'images contenues dans un texte du journal. */
exports.imagesIn = body => [...String(body || '').matchAll(IMAGE_RE)].map(m => m[1]);

/** Télécharge la photo, la range dans le storage et complète la ligne du journal. Ne lève jamais. */
const store = async event => {
  const dl = await wa.downloadMedia(event.media?.id);
  if (!dl.ok || !String(dl.mimeType).startsWith('image/') || dl.buffer.length > MAX_BYTES) {
    console.warn(`⚠️ [AI] photo ${event.messageId} de ${event.from} : téléchargement impossible ou fichier refusé`);
    return null;
  }
  const { uploadImageToSupabase } = require('../../images/uploadImage.service');
  const mime = String(dl.mimeType).split(';')[0];
  const url = await uploadImageToSupabase({ buffer: dl.buffer, mimetype: mime, originalname: `wa_${event.messageId}.${EXT[mime] || 'jpg'}` });
  const row = await repos.waConversations.getByMessageId(event.messageId);
  if (row) await repos.waConversations.setBodyByMessageId(event.messageId, row.body.replace('[image]', `[image ${url}]`));
  return url;
};

/** Lance le rangement de la photo (sans attendre). */
exports.storeImage = event => {
  const p = store(event).catch(e => {
    console.error(`❌ [AI] photo ${event.messageId} de ${event.from} : ${e.message}`);
    return null;
  });
  const set = inflight.get(event.from) || new Set();
  set.add(p);
  inflight.set(event.from, set);
  p.finally(() => {
    set.delete(p);
    if (!set.size && inflight.get(event.from) === set) inflight.delete(event.from);
  });
  return p;
};

/** Attend les photos de ce numéro encore en cours de rangement. */
exports.waitImages = phone => Promise.all([...(inflight.get(phone) || [])]);

/**
 * Montre au modèle les photos reçues depuis la dernière réponse de Yaammoo : le dernier
 * message `user` devient texte + images (les plus récentes, MAX_TO_MODEL au plus).
 */
exports.attachRecentImages = (messages, history) => {
  const lastOut = history.map(h => h.direction).lastIndexOf('out');
  const urls = history
    .slice(lastOut + 1)
    .filter(h => h.direction === 'in')
    .flatMap(h => exports.imagesIn(h.body))
    .slice(-MAX_TO_MODEL);
  const last = messages[messages.length - 1];
  if (!urls.length || last?.role !== 'user') return messages;
  last.content = [{ type: 'text', text: last.content }, ...urls.map(url => ({ type: 'image_url', image_url: { url } }))];
  return messages;
};
