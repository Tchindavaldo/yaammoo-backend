// ============================================================================
// settingsService — Réglages métier modifiables à chaud
// ============================================================================
// Source unique de vérité : les tables `settings_<categorie>` (migration 046,
// qui a éclaté l'ancienne table `settings` unique). Aucun de ces réglages ne vit
// dans `.env` : ce sont des décisions COMMERCIALES qu'on doit pouvoir basculer
// sans redéployer (`flyctl secrets set` redémarre la machine et ne rebuild pas
// le code — cf. CLAUDE.md).
//
// Huit catégories : auth, pricing, delivery, withdrawal, deployment, notification
// (migration 053), client et test (migration 055). Chaque clé
// appartient à UNE catégorie, déclarée dans `KEY_CATEGORY` ci-dessous — c'est
// elle qui décide de la table écrite. Ajouter une clé à `KEYS` sans l'y ranger
// est une erreur détectée au démarrage.
//
// ⚠️ Aucun SECRET dans ces tables : la clé d'API Bird reste en variable
// d'environnement (`.env` en local, secrets Fly en production).
//
// Les versions d'app de référence (repli sans header, seuil de chaque feature,
// R11) sont aussi en base (`settings_deployment`, migration 066) : rien sur Fly.
//
// Cache mémoire court : ces valeurs sont lues à CHAQUE affichage du home. Sans
// cache, chaque écran coûterait une requête de plus. La contrepartie est qu'une
// bascule met au plus SETTINGS_CACHE_TTL_MS à se propager — l'écriture purge le
// cache local, mais pas celui des autres machines.
// ============================================================================
const repos = require('../../repositories');
const { resolveClientVersion, compareVersions } = require('../../utils/appVersion');
const { normalizeAggregator } = require('../../utils/paymentAggregator');

const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS);

const { KEYS, KEY_CATEGORY, FALLBACKS, categoryOf } = require('./settings.keys');

// Les réglages Apple Review n'ont VOLONTAIREMENT aucun repli : inventer une
// valeur reviendrait soit à ouvrir un bypass de paiement, soit à le fermer en
// pleine review, sans que personne ne le sache. Clé absente = erreur explicite.
function requireSetting(settings, key) {
  if (!(key in settings)) {
    throw new Error(`settings: réglage "${key}" absent de la base (migration 046 non appliquée ?)`);
  }
  return settings[key];
}

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
 * le home. On journalise et on sert les replis. Les clés sans repli sont alors
 * simplement absentes du résultat — c'est `requireSetting` qui tranche.
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

/**
 * R11 : vrai si le client a au moins la version stockée sous `key` (version à
 * partir de laquelle une feature est disponible, `settings_deployment`).
 */
async function clientSupportsFeature(req, key) {
  const s = await getSettings();
  return compareVersions(resolveClientVersion(req), String(s[key])) >= 0;
}

/** Agrégateur de paiement actif (`settings_deployment.payment_aggregator`). */
async function getPaymentAggregator() {
  const s = await getSettings();
  return normalizeAggregator(s[KEYS.PAYMENT_AGGREGATOR]);
}

/** Vue typée, pour que les appelants n'aient pas à connaître les clés brutes. */
async function getPricingSettings() {
  const s = await getSettings();
  return {
    platformMargin: Number(s[KEYS.PLATFORM_MARGIN]) || 0,
    paymentFeePercent: Number(s[KEYS.PAYMENT_FEE_PERCENT]) || 0,
    // Barème de l'agrégateur ACTIF (`payment_aggregator` en base), lu par
    // `pricing/paymentFees.js`. Chaque agrégateur garde ses propres clés.
    paymentFees: {
      aggregator: normalizeAggregator(s[KEYS.PAYMENT_AGGREGATOR]),
      digikuntz: { percent: Number(s[KEYS.PAYMENT_FEE_PERCENT]) || 0 },
      pawapay: {
        deposit: {
          mtn: Number(s[KEYS.PAWAPAY_DEPOSIT_FEE_MTN_PERCENT]) || 0,
          orange: Number(s[KEYS.PAWAPAY_DEPOSIT_FEE_ORANGE_PERCENT]) || 0,
        },
        mwCommission: Number(s[KEYS.PAWAPAY_MW_COMMISSION_PERCENT]) || 0,
        payoutReserve: {
          mtn: Number(s[KEYS.PAWAPAY_PAYOUT_FEE_MTN_PERCENT]) || 0,
          orange: Number(s[KEYS.PAWAPAY_PAYOUT_FEE_ORANGE_PERCENT]) || 0,
        },
      },
    },
    deliveryFreeMode: s[KEYS.DELIVERY_FREE_MODE] === true,
    priceRoundingStep: Number(s[KEYS.PRICE_ROUNDING_STEP]) || 0,
    expressPriceRoundingStep: Number(s[KEYS.EXPRESS_PRICE_ROUNDING_STEP]) || 0,
    platformFreeDeliveryMinItemsBonus: Number(s[KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_BONUS]) || 1,
    platformFreeDeliveryMinItemsCampaign: Number(s[KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_CAMPAIGN]) || 1,
    driverAmortizationMax: Number(s[KEYS.DRIVER_AMORTIZATION_MAX]) || 0,
    fastfoodMargin: Number(s[KEYS.FASTFOOD_MARGIN]) || 0,
    fastfoodMarginTier2MinBrut: Number(s[KEYS.FASTFOOD_MARGIN_TIER_2_MIN_BRUT]) || 0,
    fastfoodMarginTier2Margin: Number(s[KEYS.FASTFOOD_MARGIN_TIER_2_MARGIN]) || 0,
    fastfoodMinCoveredCourse: Number(s[KEYS.FASTFOOD_MIN_COVERED_COURSE]) || 0,
    withdrawalFees: {
      mtn: {
        threshold: Number(s[KEYS.WITHDRAWAL_FEE_MTN_THRESHOLD]) || 0,
        flat: Number(s[KEYS.WITHDRAWAL_FEE_MTN_FLAT]) || 0,
        percent: Number(s[KEYS.WITHDRAWAL_FEE_MTN_PERCENT]) || 0,
        addend: Number(s[KEYS.WITHDRAWAL_FEE_MTN_ADDEND]) || 0,
      },
      orange: {
        threshold: Number(s[KEYS.WITHDRAWAL_FEE_ORANGE_THRESHOLD]) || 0,
        flat: Number(s[KEYS.WITHDRAWAL_FEE_ORANGE_FLAT]) || 0,
        percent: Number(s[KEYS.WITHDRAWAL_FEE_ORANGE_PERCENT]) || 0,
        addend: Number(s[KEYS.WITHDRAWAL_FEE_ORANGE_ADDEND]) || 0,
      },
    },
  };
}

/**
 * Réglages de l'auth par téléphone (OTP Bird). Ne lève jamais : les replis
 * ci-dessus s'appliquent, dans le sens qui protège la facture.
 *
 * La clé d'API Bird n'en fait PAS partie : c'est un secret, lu depuis
 * `process.env.BIRD_API_KEY` par `config/bird.js`.
 */
async function getOtpSettings() {
  const s = await getSettings();
  const cooldown = Number(s[KEYS.OTP_RESEND_COOLDOWN_SECONDS]);
  const expiresIn = Number(s[KEYS.OTP_EXPIRES_IN_SECONDS]);
  const timeout = Number(s[KEYS.OTP_BIRD_TIMEOUT_MS]);
  const countryCode = String(s[KEYS.OTP_DEFAULT_COUNTRY_CODE] ?? '').replace(/\D/g, '');

  return {
    // `Number.isFinite` et non `|| fallback` : un cooldown volontairement mis à
    // 0 (désactivé en recette) doit être respecté, pas écrasé par le repli.
    resendCooldownSeconds: Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 60,
    expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 600,
    birdTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
    defaultCountryCode: countryCode || '237',
  };
}

/**
 * Réglages de la suppression admin de boutiques (migration 048).
 * Ne lève jamais : les replis ci-dessus s'appliquent, dans le sens qui protège
 * la donnée (rétention allongée plutôt que raccourcie).
 */
async function getFastfoodDeletionSettings() {
  const s = await getSettings();
  const retention = Number(s[KEYS.FASTFOOD_DELETE_RETENTION_DAYS]);
  const interval = Number(s[KEYS.FASTFOOD_PURGE_INTERVAL_MS]);

  return {
    // `> 0` et non `>= 0` : une rétention à 0 effacerait au premier passage du
    // job, ce que ce réglage ne doit pas permettre — pour purger tout de suite,
    // il y a `POST /fastFood/admin/purge` avec un `retentionDays` explicite.
    retentionDays: Number.isFinite(retention) && retention > 0 ? retention : 90,
    // 0 est ici légitime : il DÉSACTIVE la purge automatique (le job ne démarre
    // pas). D'où `>= 0`, contrairement à la rétention.
    purgeIntervalMs: Number.isFinite(interval) && interval >= 0 ? interval : 86400000,
  };
}

/** Mode Apple Review global, tel qu'exposé au frontend. Lève si la clé manque. */
async function getAppleReviewMode() {
  const s = await getSettings();
  return requireSetting(s, KEYS.APPLE_REVIEW_MODE) === true;
}

/**
 * Vrai si la version d'app du client est EXACTEMENT celle en cours de review.
 * Égalité stricte, pas un seuil : seule la build soumise à Apple doit sauter le
 * paiement — toutes les autres versions paient normalement.
 * Lève si le réglage est absent de la base.
 */
async function isAppleReviewClient(req) {
  const s = await getSettings();
  const reviewVersion = String(requireSetting(s, KEYS.APPLE_VERSION_REVIEW_MODE) || '').trim();
  if (!reviewVersion) return false;
  return resolveClientVersion(req) === reviewVersion;
}

/**
 * Vrai si le client est une build de TEST : sa version figure dans
 * `test_app_version` (tableau depuis la migration 056). Générique : tout
 * comportement réservé aux builds de test (mode volume, paiement gratuit)
 * s'appuie sur cette seule fonction.
 *
 * Égalité stricte sur le header `x-app-version` UNIQUEMENT, sans le repli
 * repli '0.0.0' : un client sans header
 * (ancienne app, curl) ne doit jamais être pris pour une build de test.
 * Ancienne forme chaîne acceptée (migration 056 pas encore appliquée).
 *
 * OU l'utilisateur figure dans `test_user_ids` (migration 057), quelle que
 * soit sa version : `userId` explicite (corps de `POST /transaction`), sinon
 * l'uid du token (`req.user`, route à auth optionnelle).
 * Ne lève jamais : clés absentes = aucune build de test.
 */
async function isTestClient(req, userId) {
  const s = await getSettings();
  const toList = raw => (Array.isArray(raw) ? raw : [raw]).map(v => String(v ?? '').trim()).filter(Boolean);
  const headerVersion = String(req?.headers?.['x-app-version'] || '').trim();
  if (headerVersion && toList(s[KEYS.TEST_APP_VERSION]).includes(headerVersion)) return true;
  const uid = String(userId || req?.user?.uid || '').trim();
  return !!uid && toList(s[KEYS.TEST_USER_IDS]).includes(uid);
}

/**
 * Vrai si la version du client (header `x-app-version` seul) figure dans
 * `test_no_auth_versions` : tolérée sans jeton sur les routes protégées.
 * Ne lève jamais : clé absente = personne.
 */
async function isNoAuthToleratedClient(req) {
  const s = await getSettings();
  const raw = s[KEYS.TEST_NO_AUTH_VERSIONS];
  const versions = (Array.isArray(raw) ? raw : []).map(v => String(v ?? '').trim()).filter(Boolean);
  const headerVersion = String(req?.headers?.['x-app-version'] || '').trim();
  return !!headerVersion && versions.includes(headerVersion);
}

/** Boutiques servies en mode volume à la build de test. Ne lève jamais. */
async function getTestFastfoodVolume() {
  const s = await getSettings();
  const n = Number(s[KEYS.TEST_FASTFOOD_VOLUME]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}

/**
 * Gabarit d'URL des images du mode volume (`{seed}` = id cloné). Chaîne vide =
 * images réelles gardées. Ne lève jamais.
 */
async function getTestVolumeImageUrl() {
  const s = await getSettings();
  return String(s[KEYS.TEST_VOLUME_IMAGE_URL] || '').trim();
}

/**
 * Réglages d'affichage renvoyés à l'app (`settings_client`, migration 055) par
 * la première page de `GET /fastFood/all`. Clé absente ou mal typée = `null` :
 * l'app garde sa valeur de secours, écrite dans son code. Pas de repli ici,
 * pour ne pas tenir deux valeurs de secours alignées. Ne lève jamais.
 */
async function getClientSettings() {
  const s = await getSettings();
  const pageSize = s[KEYS.HOME_PAGE_SIZE];
  const prefetch = s[KEYS.HOME_PREFETCH_DISTANCE];
  return {
    homePageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : null,
    homePrefetchDistance: Number.isFinite(prefetch) && prefetch >= 0 ? prefetch : null,
  };
}

/**
 * État de version pour le client courant : faut-il bloquer (forceUpdate) ou
 * juste signaler qu'une nouvelle version existe (updateAvailable).
 * Ne lève jamais — clés absentes ou mal formées = repli "0.0.0", jamais bloquant.
 */
async function getAppVersionGate(req) {
  const s = await getSettings();
  const minVersion = String(s[KEYS.MIN_APP_VERSION] || '0.0.0');
  const latestVersion = String(s[KEYS.LATEST_APP_VERSION] || '0.0.0');
  const clientVersion = resolveClientVersion(req);

  return {
    clientVersion,
    minVersion,
    latestVersion,
    forceUpdate: compareVersions(clientVersion, minVersion) < 0,
    updateAvailable: compareVersions(clientVersion, latestVersion) < 0,
  };
}

/** Écrit un réglage dans la table de SA catégorie. Lève si la clé est inconnue. */
async function setSetting(key, value) {
  const saved = await repos.settings.set(categoryOf(key), key, value);
  invalidate();
  return saved;
}

module.exports = {
  KEYS,
  KEY_CATEGORY,
  categoryOf,
  getSettings,
  getPricingSettings,
  getPaymentAggregator,
  clientSupportsFeature,
  getOtpSettings,
  getFastfoodDeletionSettings,
  getAppleReviewMode,
  isAppleReviewClient,
  isTestClient,
  isNoAuthToleratedClient,
  getTestFastfoodVolume,
  getTestVolumeImageUrl,
  getClientSettings,
  getAppVersionGate,
  setSetting,
  invalidate,
};
