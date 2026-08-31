// ============================================================================
// settingsService — Réglages métier modifiables à chaud
// ============================================================================
// Source unique de vérité : les tables `settings_<categorie>` (migration 046,
// qui a éclaté l'ancienne table `settings` unique). Aucun de ces réglages ne vit
// dans `.env` : ce sont des décisions COMMERCIALES qu'on doit pouvoir basculer
// sans redéployer (`flyctl secrets set` redémarre la machine et ne rebuild pas
// le code — cf. CLAUDE.md).
//
// Cinq catégories : auth, pricing, delivery, withdrawal, deployment. Chaque clé
// appartient à UNE catégorie, déclarée dans `KEY_CATEGORY` ci-dessous — c'est
// elle qui décide de la table écrite. Ajouter une clé à `KEYS` sans l'y ranger
// est une erreur détectée au démarrage.
//
// ⚠️ Aucun SECRET dans ces tables : la clé d'API Bird reste en variable
// d'environnement (`.env` en local, secrets Fly en production).
//
// Les seuils de version d'app (compatibilité ascendante des données) restent en
// `.env` : ils sont liés au déploiement. Exception : `apple_version_review_mode`,
// qui n'est pas un seuil de compatibilité mais la désignation ponctuelle de la
// build soumise à Apple — elle doit basculer sans redéployer.
//
// Cache mémoire court : ces valeurs sont lues à CHAQUE affichage du home. Sans
// cache, chaque écran coûterait une requête de plus. La contrepartie est qu'une
// bascule met au plus SETTINGS_CACHE_TTL_MS à se propager — l'écriture purge le
// cache local, mais pas celui des autres machines.
// ============================================================================
const repos = require('../../repositories');
const { resolveClientVersion, compareVersions } = require('../../utils/appVersion');

const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS);

// Clés connues. Un repli n'est défini que pour les réglages TARIFAIRES, où le
// comportement le PLUS SÛR existe : pas de campagne en cours, et une tarification
// qui n'invente pas de marge. Les réglages Apple Review, eux, n'en ont pas.
const KEYS = {
  PLATFORM_MARGIN: 'platform_margin',
  PAYMENT_FEE_PERCENT: 'payment_fee_percent',
  DELIVERY_FREE_MODE: 'delivery_free_mode',
  APPLE_REVIEW_MODE: 'apple_review_mode',
  APPLE_VERSION_REVIEW_MODE: 'apple_version_review_mode',
  // Frais de RETRAIT (migration 037) — un jeu de clés par opérateur : les
  // valeurs sont identiques aujourd'hui, mais un opérateur qui change son
  // barème ne doit pas entraîner l'autre.
  WITHDRAWAL_FEE_MTN_THRESHOLD: 'withdrawal_fee_mtn_threshold',
  WITHDRAWAL_FEE_MTN_FLAT: 'withdrawal_fee_mtn_flat',
  WITHDRAWAL_FEE_MTN_PERCENT: 'withdrawal_fee_mtn_percent',
  WITHDRAWAL_FEE_MTN_ADDEND: 'withdrawal_fee_mtn_addend',
  WITHDRAWAL_FEE_ORANGE_THRESHOLD: 'withdrawal_fee_orange_threshold',
  WITHDRAWAL_FEE_ORANGE_FLAT: 'withdrawal_fee_orange_flat',
  WITHDRAWAL_FEE_ORANGE_PERCENT: 'withdrawal_fee_orange_percent',
  WITHDRAWAL_FEE_ORANGE_ADDEND: 'withdrawal_fee_orange_addend',
  // Livraison PLATEFORME (migration 037)
  PRICE_ROUNDING_STEP: 'price_rounding_step',
  DRIVER_AMORTIZATION_MAX: 'driver_amortization_max',
  // Pas d'arrondi propre aux ZONES EXPRESS (migration 040). Distinct de
  // `price_rounding_step` : le pas des plats s'applique à des montants bien plus
  // gros, où il se dilue. Toujours vers le HAUT, jamais d'amortissement.
  EXPRESS_PRICE_ROUNDING_STEP: 'express_price_rounding_step',
  // Marge en régime FASTFOOD (migration 038) — clé DISTINCTE de
  // `platform_margin` : les deux régimes ne composent pas le prix de la même
  // façon (le fastfood ne fond plus aucune zone dedans), leur marge n'a donc
  // aucune raison de bouger ensemble.
  FASTFOOD_MARGIN: 'fastfood_margin',
  // Palier 2 : à partir de ce prix BRUT, la marge fastfood vaut le montant du
  // palier au lieu de `fastfood_margin`.
  FASTFOOD_MARGIN_TIER_2_MIN_BRUT: 'fastfood_margin_tier_2_min_brut',
  FASTFOOD_MARGIN_TIER_2_MARGIN: 'fastfood_margin_tier_2_margin',
  // Course qu'un plat doit pouvoir couvrir à lui seul, via son surplus
  // d'arrondi (migration 039). Sert à REFUSER les prix de menu trop justes.
  FASTFOOD_MIN_COVERED_COURSE: 'fastfood_min_covered_course',
  // Plats minimum sur un DÉPART pour qu'une livraison offerte s'applique, en
  // régime PLATEFORME (migration 041). Deux clés DISTINCTES : une campagne
  // globale et un bonus nominatif ne se pilotent pas ensemble — on peut vouloir
  // durcir l'une sans toucher à l'autre.
  PLATFORM_FREE_DELIVERY_MIN_ITEMS_BONUS: 'platform_free_delivery_min_items_bonus',
  PLATFORM_FREE_DELIVERY_MIN_ITEMS_CAMPAIGN: 'platform_free_delivery_min_items_campaign',
  // Gate de version d'app (migration 042) — écran de mise à jour forcée.
  MIN_APP_VERSION: 'platform_min_app_version',
  LATEST_APP_VERSION: 'platform_latest_app_version',
  // Auth par numéro de téléphone / OTP Bird (migration 046). Une clé par
  // réglage : le cooldown est le levier direct sur la facture Bird (chaque
  // envoi est payant) et doit pouvoir se durcir sans toucher aux autres.
  // ⚠️ La clé d'API Bird n'est PAS ici : c'est un secret (.env / secrets Fly).
  OTP_RESEND_COOLDOWN_SECONDS: 'otp_resend_cooldown_seconds',
  OTP_EXPIRES_IN_SECONDS: 'otp_expires_in_seconds',
  OTP_DEFAULT_COUNTRY_CODE: 'otp_default_country_code',
  OTP_BIRD_TIMEOUT_MS: 'otp_bird_timeout_ms',
  // Suppression admin de boutiques (migration 048). La rétention décide du délai
  // pendant lequel une suppression reste annulable : il doit pouvoir s'allonger
  // à chaud, typiquement pour sauver une boutique dont les 30 jours expirent.
  FASTFOOD_DELETE_RETENTION_DAYS: 'fastfood_delete_retention_days',
  FASTFOOD_PURGE_INTERVAL_MS: 'fastfood_purge_interval_ms',
};

// ---------------------------------------------------------------------------
// Rangement des clés par catégorie (migration 046)
// ---------------------------------------------------------------------------
// La catégorie détermine la TABLE écrite. Elle est déclarée, jamais déduite du
// préfixe de la clé : `platform_margin` est un réglage de prix tandis que
// `platform_min_app_version` relève du déploiement — un préfixe commun ne dit
// rien de la catégorie.
const KEY_CATEGORY = {
  // auth — authentification par numéro de téléphone (OTP Bird)
  [KEYS.OTP_RESEND_COOLDOWN_SECONDS]: 'auth',
  [KEYS.OTP_EXPIRES_IN_SECONDS]: 'auth',
  [KEYS.OTP_DEFAULT_COUNTRY_CODE]: 'auth',
  [KEYS.OTP_BIRD_TIMEOUT_MS]: 'auth',

  // pricing — composition des prix et marges
  [KEYS.PLATFORM_MARGIN]: 'pricing',
  [KEYS.PAYMENT_FEE_PERCENT]: 'pricing',
  [KEYS.PRICE_ROUNDING_STEP]: 'pricing',
  [KEYS.EXPRESS_PRICE_ROUNDING_STEP]: 'pricing',
  [KEYS.DRIVER_AMORTIZATION_MAX]: 'pricing',
  [KEYS.FASTFOOD_MARGIN]: 'pricing',
  [KEYS.FASTFOOD_MARGIN_TIER_2_MIN_BRUT]: 'pricing',
  [KEYS.FASTFOOD_MARGIN_TIER_2_MARGIN]: 'pricing',
  [KEYS.FASTFOOD_MIN_COVERED_COURSE]: 'pricing',

  // delivery — livraison offerte et ses seuils
  [KEYS.DELIVERY_FREE_MODE]: 'delivery',
  [KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_BONUS]: 'delivery',
  [KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_CAMPAIGN]: 'delivery',

  // withdrawal — barèmes de frais de retrait, par opérateur
  [KEYS.WITHDRAWAL_FEE_MTN_THRESHOLD]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_MTN_FLAT]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_MTN_PERCENT]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_MTN_ADDEND]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_ORANGE_THRESHOLD]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_ORANGE_FLAT]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_ORANGE_PERCENT]: 'withdrawal',
  [KEYS.WITHDRAWAL_FEE_ORANGE_ADDEND]: 'withdrawal',

  // deployment — versions d'app et Apple Review
  [KEYS.MIN_APP_VERSION]: 'deployment',
  [KEYS.LATEST_APP_VERSION]: 'deployment',
  [KEYS.APPLE_REVIEW_MODE]: 'deployment',
  [KEYS.APPLE_VERSION_REVIEW_MODE]: 'deployment',
  // Suppression de boutiques : exploitation, pas tarification ni livraison.
  [KEYS.FASTFOOD_DELETE_RETENTION_DAYS]: 'deployment',
  [KEYS.FASTFOOD_PURGE_INTERVAL_MS]: 'deployment',
};

// Garde-fou au chargement : une clé ajoutée à `KEYS` sans être rangée ici
// serait écrite dans aucune table. Mieux vaut le voir au démarrage qu'au
// premier PATCH en production.
{
  const unmapped = Object.values(KEYS).filter(k => !KEY_CATEGORY[k]);
  if (unmapped.length) {
    throw new Error(`settings: clés sans catégorie déclarée dans KEY_CATEGORY — ${unmapped.join(', ')}`);
  }
}

/** Catégorie (donc table) d'une clé. Lève si la clé est inconnue. */
function categoryOf(key) {
  const category = KEY_CATEGORY[key];
  if (!category) throw new Error(`settings: clé inconnue "${key}"`);
  return category;
}

const FALLBACKS = {
  [KEYS.PLATFORM_MARGIN]: 0,
  [KEYS.PAYMENT_FEE_PERCENT]: 0,
  [KEYS.DELIVERY_FREE_MODE]: false,
  // Frais de retrait : repli à 0. Sous-facturer coûte à la plateforme, mais
  // sur-facturer sans savoir pourquoi ferait payer le client pour rien.
  [KEYS.WITHDRAWAL_FEE_MTN_THRESHOLD]: 0,
  [KEYS.WITHDRAWAL_FEE_MTN_FLAT]: 0,
  [KEYS.WITHDRAWAL_FEE_MTN_PERCENT]: 0,
  [KEYS.WITHDRAWAL_FEE_MTN_ADDEND]: 0,
  [KEYS.WITHDRAWAL_FEE_ORANGE_THRESHOLD]: 0,
  [KEYS.WITHDRAWAL_FEE_ORANGE_FLAT]: 0,
  [KEYS.WITHDRAWAL_FEE_ORANGE_PERCENT]: 0,
  [KEYS.WITHDRAWAL_FEE_ORANGE_ADDEND]: 0,
  // Pas d'arrondi à 0 = aucun arrondi (le prix juste est servi tel quel), et
  // aucune course amortie : un incident de lecture ne doit pas rogner le livreur.
  [KEYS.PRICE_ROUNDING_STEP]: 0,
  [KEYS.DRIVER_AMORTIZATION_MAX]: 0,
  // 0 = aucun arrondi sur l'express : le prix juste (frais inclus) est servi tel
  // quel. Le livreur reste couvert, seul l'affichage perd sa rondeur.
  [KEYS.EXPRESS_PRICE_ROUNDING_STEP]: 0,
  // Marge fastfood à 0 : aucune marge inventée si la clé manque, comme
  // `platform_margin`. Seuil de palier à 0 = aucun palier.
  [KEYS.FASTFOOD_MARGIN]: 0,
  [KEYS.FASTFOOD_MARGIN_TIER_2_MIN_BRUT]: 0,
  [KEYS.FASTFOOD_MARGIN_TIER_2_MARGIN]: 0,
  // 0 = aucune exigence : tous les prix passent. Repli sûr — une clé absente ne
  // doit pas bloquer la création de menus.
  [KEYS.FASTFOOD_MIN_COVERED_COURSE]: 0,
  // Repli à 1, pas à 0 : une clé illisible ne doit JAMAIS refuser un paiement
  // par excès de zèle. À 1, la gratuité s'applique dès le premier plat — le
  // livreur peut y absorber une partie de sa course, mais la marge reste servie
  // et aucune commande n'est bloquée à tort.
  [KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_BONUS]: 1,
  [KEYS.PLATFORM_FREE_DELIVERY_MIN_ITEMS_CAMPAIGN]: 1,
  // "0.0.0" = jamais bloquant : une clé absente ou illisible ne doit jamais
  // couper l'accès à l'app.
  [KEYS.MIN_APP_VERSION]: '0.0.0',
  [KEYS.LATEST_APP_VERSION]: '0.0.0',
  // OTP : replis PRUDENTS, dans le sens qui protège la facture Bird. Un
  // cooldown à 0 sur clé absente ouvrirait les renvois en rafale — donc 60 s.
  // L'indicatif tombe sur le Cameroun, seul pays servi aujourd'hui.
  [KEYS.OTP_RESEND_COOLDOWN_SECONDS]: 60,
  [KEYS.OTP_EXPIRES_IN_SECONDS]: 600,
  [KEYS.OTP_DEFAULT_COUNTRY_CODE]: '237',
  [KEYS.OTP_BIRD_TIMEOUT_MS]: 15000,
  // Rétention : le repli va dans le sens qui PROTÈGE la donnée. Une clé absente
  // ou illisible ne doit jamais raccourcir le délai — elle l'allonge (90 j).
  // Purger trop tôt est irréversible ; purger trop tard ne coûte que du stockage.
  [KEYS.FASTFOOD_DELETE_RETENTION_DAYS]: 90,
  [KEYS.FASTFOOD_PURGE_INTERVAL_MS]: 86400000,
};

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

/** Vue typée, pour que les appelants n'aient pas à connaître les clés brutes. */
async function getPricingSettings() {
  const s = await getSettings();
  return {
    platformMargin: Number(s[KEYS.PLATFORM_MARGIN]) || 0,
    paymentFeePercent: Number(s[KEYS.PAYMENT_FEE_PERCENT]) || 0,
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

module.exports = { KEYS, KEY_CATEGORY, categoryOf, getSettings, getPricingSettings, getOtpSettings, getFastfoodDeletionSettings, getAppleReviewMode, isAppleReviewClient, getAppVersionGate, setSetting, invalidate };
