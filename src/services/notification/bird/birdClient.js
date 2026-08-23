const { BIRD_API_URL, BIRD_API_KEY } = require('../../../config/bird');
const settingsService = require('../../settings/settings.service');

// Le backend n'embarque pas axios : on s'appuie sur le `fetch` natif de Node 18+.
//
// Timeout de dernier recours, si la lecture des settings échoue elle-même.
const FALLBACK_TIMEOUT_MS = 15000;

/** Timeout courant, depuis `settings.otp_bird_timeout_ms` (migration 046). */
const resolveTimeout = async () => {
  try {
    const { birdTimeoutMs } = await settingsService.getOtpSettings();
    return birdTimeoutMs;
  } catch {
    return FALLBACK_TIMEOUT_MS;
  }
};

/**
 * Erreur portant le statut HTTP et la réponse brute de Bird, afin que les
 * services puissent distinguer un refus métier (4xx) d'une panne réseau.
 */
class BirdHttpError extends Error {
  constructor(status, payload) {
    super(`Bird HTTP ${status}`);
    this.name = 'BirdHttpError';
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Appel HTTP vers la plateforme Bird ({region}.platform.bird.com).
 * L'authentification se fait par bearer token (clé bk_{region}_...).
 *
 * La clé est lue à chaque requête (et non figée à l'import) pour rester
 * correcte même si dotenv est chargé après ce module.
 *
 * @param {'GET'|'POST'} method
 * @param {string} path chemin absolu, ex. '/v1/verify/verifications'
 * @param {object} [body]
 */
const birdRequest = async (method, path, body) => {
  const apiKey = process.env.BIRD_API_KEY || BIRD_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), await resolveTimeout());

  try {
    const response = await fetch(`${BIRD_API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Bird répond parfois en texte brut sur les erreurs de passerelle.
        payload = { message: text };
      }
    }

    if (!response.ok) throw new BirdHttpError(response.status, payload);

    return payload;
  } finally {
    clearTimeout(timer);
  }
};

const birdClient = {
  get: path => birdRequest('GET', path),
  post: (path, body) => birdRequest('POST', path, body),
};

/**
 * Normalise une erreur Bird en message exploitable.
 *
 * @param {unknown} error
 * @param {string} context
 */
const formatBirdError = (error, context) => {
  const status = error?.status;
  const payload = error?.payload;
  const detail = payload?.message || payload?.error?.message || payload?.detail || (Array.isArray(payload?.errors) ? payload.errors.map(e => e.message || e.code).join(', ') : null) || error?.message;

  return {
    message: `${context} : ${detail}`,
    status: status || 500,
    details: payload || null,
  };
};

module.exports = { birdClient, formatBirdError, BirdHttpError };
