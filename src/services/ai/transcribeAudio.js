// Transcription d'un fichier audio par les modèles OpenRouter qui écoutent
// (settings_app.ai_audio_models, migration 099), essayés UN PAR UN dans l'ordre : le suivant
// prend le relais si un modèle échoue, refuse le format ou ne renvoie rien. Utilisé par
// services/whatsapp/ai/voiceNotes.js. Doc : architecture/whatsapp-ai.md (« Notes vocales »).
// Ne lève jamais : renvoie { ok, text, model, error }.
const { chat } = require('./openrouter.client');

// Type MIME -> `input_audio.format` (Chat Completions d'OpenRouter, format du fournisseur).
const FORMATS = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

/** Format OpenRouter d'un type MIME (`audio/ogg; codecs=opus` -> `ogg`), null s'il n'est pas pris en charge. */
exports.audioFormat = mimeType =>
  FORMATS[
    String(mimeType || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
  ] || null;

/**
 * @param {{ models: string[], buffer: Buffer, mimeType: string, prompt: string, timeoutMs: number }} p
 * @returns {Promise<{ ok: boolean, text?: string, model?: string, error?: string }>}
 */
exports.transcribeAudio = async ({ models, buffer, mimeType, prompt, timeoutMs }) => {
  const format = exports.audioFormat(mimeType);
  if (!format) return { ok: false, error: `format audio non pris en charge (${mimeType})` };
  const content = [
    { type: 'text', text: prompt },
    { type: 'input_audio', input_audio: { data: buffer.toString('base64'), format } },
  ];
  for (const model of models || []) {
    const r = await chat({ models: [model], messages: [{ role: 'user', content }], timeoutMs });
    const text = r.ok ? String(r.message.content || '').trim() : '';
    if (text) return { ok: true, text, model: r.model || model };
    console.warn(`⚠️ [AI] transcription par ${model} : ${r.ok ? 'réponse vide' : r.error}`);
  }
  return { ok: false, error: models?.length ? 'aucun modèle n’a transcrit' : 'aucun modèle (settings_app.ai_audio_models)' };
};
