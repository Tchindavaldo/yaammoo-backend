// ============================================================================
// settingsService — Réglages métier modifiables à chaud
// ============================================================================
// Source unique de vérité : la table `settings` (migration 019). Aucun de ces
// réglages ne vit dans `.env` : ce sont des décisions COMMERCIALES qu'on doit
// pouvoir basculer sans redéployer (`flyctl secrets set` redémarre la machine
// et ne rebuild pas le code — cf. CLAUDE.md).
//
// Les seuils de version d'app, eux, restent en `.env` : liés au déploiement.
//
// Cache mémoire court : ces valeurs sont lues à CHAQUE affichage du home. Sans
// cache, chaque écran coûterait une requête de plus. La contrepartie est qu'une
// bascule met au plus SETTINGS_CACHE_TTL_MS à se propager — l'écriture purge le
// cache local, mais pas celui des autres machines.
// ============================================================================
const repos = require('../../repositories');

const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS);

// Clés connues + valeur de repli si la table est injoignable ou la clé absente.
// Le repli doit être le comportement le PLUS SÛR : pas de campagne en cours,
// et une tarification qui n'invente pas de marge.
const KEYS = {
  PLATFORM_MARGIN: 'platform_margin',
  PAYMENT_FEE_PERCENT: 'payment_fee_percent',
  DELIVERY_FREE_MODE: 'delivery_free_mode',
};

const FALLBACKS = {
  [KEYS.PLATFORM_MARGIN]: 0,
  [KEYS.PAYMENT_FEE_PERCENT]: 0,
  [KEYS.DELIVERY_FREE_MODE]: false,
};

let cache = null;
let cachedAt = 0;

/** Vide le cache local — appelé après écriture. */
function invalidate() {
  cache = null;
  cachedAt = 0;
}

/**
 * Tous les réglages, complétés par les replis.
 * Ne lève jamais : un incident sur `settings` ne doit pas empêcher d'afficher
 * le home. On journalise et on sert les replis.
 */
async function getSettings() {
  const ttl = Number.isFinite(CACHE_TTL_MS) ? CACHE_TTL_MS : 0;
  if (cache && Date.now() - cachedAt < ttl) return cache;

  try {
    const stored = await repos.settings.getAll();
    cache = { ...FALLBACKS, ...stored };
    cachedAt = Date.now();
  } catch (error) {
    console.error('settings: lecture impossible, repli sur les valeurs par défaut —', error.message);
    cache = { ...FALLBACKS };
    cachedAt = Date.now();
  }
  return cache;
}

/** Vue typée, pour que les appelants n'aient pas à connaître les clés brutes. */
async function getPricingSettings() {
  const s = await getSettings();
  return {
    platformMargin: Number(s[KEYS.PLATFORM_MARGIN]) || 0,
    paymentFeePercent: Number(s[KEYS.PAYMENT_FEE_PERCENT]) || 0,
    deliveryFreeMode: s[KEYS.DELIVERY_FREE_MODE] === true,
  };
}

async function setSetting(key, value) {
  const saved = await repos.settings.set(key, value);
  invalidate();
  return saved;
}

module.exports = { KEYS, getSettings, getPricingSettings, setSetting, invalidate };
