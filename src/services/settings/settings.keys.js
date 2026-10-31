// ============================================================================
// settings.keys — Clés de réglage, catégorie (table) de chacune, replis
// ============================================================================
// Sorti de `settings.service.js` (plafond de 500 lignes, R3). Ajouter une clé :
//   1. la déclarer dans `KEYS` ;
//   2. la ranger dans `KEY_CATEGORY` (sinon erreur au démarrage) ;
//   3. lui donner un repli dans `FALLBACKS` si un comportement sûr existe.
// ============================================================================
// Clés connues. Un repli n'est défini que pour les réglages TARIFAIRES, où le
// comportement le PLUS SÛR existe : pas de campagne en cours, et une tarification
// qui n'invente pas de marge. Les réglages Apple Review, eux, n'en ont pas.
const KEYS = {
  PLATFORM_MARGIN: 'platform_margin',
  // DigiKUNTZ : taux TOUT COMPRIS (commission MobileWallet incluse) — c'est
  // pourquoi il n'a pas de clé de commission MW séparée, contrairement à pawaPay.
  PAYMENT_FEE_PERCENT: 'payment_fee_percent',
  // pawaPay (migration 063) : trois frais distincts, chacun calculé sur le
  // montant payé et arrondi à l'excès séparément. Voir `pricing/paymentFees.js`.
  PAWAPAY_DEPOSIT_FEE_MTN_PERCENT: 'pawapay_deposit_fee_mtn_percent',
  PAWAPAY_DEPOSIT_FEE_ORANGE_PERCENT: 'pawapay_deposit_fee_orange_percent',
  PAWAPAY_MW_COMMISSION_PERCENT: 'pawapay_mw_commission_percent',
  PAWAPAY_PAYOUT_FEE_MTN_PERCENT: 'pawapay_payout_fee_mtn_percent',
  PAWAPAY_PAYOUT_FEE_ORANGE_PERCENT: 'pawapay_payout_fee_orange_percent',
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
  // Version supposée sans header `x-app-version` (R11, migration 066).
  DEFAULT_APP_VERSION: 'platform_default_app_version',
  // Agrégateur de paiement actif (migration 065) : pawapay | digikuntz.
  PAYMENT_AGGREGATOR: 'payment_aggregator',
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
  // Builds de TEST (migration 051, table `settings_test` depuis la 055, tableau
  // depuis la 056) : versions d'app exactes qui reçoivent les comportements de
  // test (mode volume de `GET /fastFood/all`, paiement gratuit). [] = aucune.
  TEST_APP_VERSION: 'test_app_version',
  // Migration 057 : uid des utilisateurs de test (tableau), traités comme une
  // build de test quelle que soit leur version. [] = aucun.
  TEST_USER_IDS: 'test_user_ids',
  // Migration 058 : versions d'app tolérées SANS jeton (tableau). [] = aucune.
  TEST_NO_AUTH_VERSIONS: 'test_no_auth_versions',
  TEST_FASTFOOD_VOLUME: 'test_fastfood_volume',
  // Migration 052 : gabarit d'URL (`{seed}`) des images du mode volume.
  TEST_VOLUME_IMAGE_URL: 'test_volume_image_url',
  // Notifications boutique (migration 053) : plans (quotas + audiences) et
  // fuseau des bornes de quota. Lus via `broadcastPlan.js`.
  BROADCAST_PLANS: 'broadcast_plans',
  BROADCAST_UTC_OFFSET_MINUTES: 'broadcast_utc_offset_minutes',
  // Affichage de l'app (migration 055), renvoyé par la première page de
  // `GET /fastFood/all`. Lus via `getClientSettings()`.
  HOME_PAGE_SIZE: 'home_page_size',
  HOME_PREFETCH_DISTANCE: 'home_prefetch_distance',
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
  [KEYS.PAWAPAY_DEPOSIT_FEE_MTN_PERCENT]: 'pricing',
  [KEYS.PAWAPAY_DEPOSIT_FEE_ORANGE_PERCENT]: 'pricing',
  [KEYS.PAWAPAY_MW_COMMISSION_PERCENT]: 'pricing',
  [KEYS.PAWAPAY_PAYOUT_FEE_MTN_PERCENT]: 'pricing',
  [KEYS.PAWAPAY_PAYOUT_FEE_ORANGE_PERCENT]: 'pricing',
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
  [KEYS.PAYMENT_AGGREGATOR]: 'deployment',
  [KEYS.DEFAULT_APP_VERSION]: 'deployment',
  [KEYS.APPLE_REVIEW_MODE]: 'deployment',
  [KEYS.APPLE_VERSION_REVIEW_MODE]: 'deployment',
  // Suppression de boutiques : exploitation, pas tarification ni livraison.
  [KEYS.FASTFOOD_DELETE_RETENTION_DAYS]: 'deployment',
  [KEYS.FASTFOOD_PURGE_INTERVAL_MS]: 'deployment',

  // test — build de test (sorties de `deployment` par la migration 055)
  [KEYS.TEST_APP_VERSION]: 'test',
  [KEYS.TEST_USER_IDS]: 'test',
  [KEYS.TEST_NO_AUTH_VERSIONS]: 'test',
  [KEYS.TEST_FASTFOOD_VOLUME]: 'test',
  [KEYS.TEST_VOLUME_IMAGE_URL]: 'test',

  // notification — notifications envoyées par les boutiques
  [KEYS.BROADCAST_PLANS]: 'notification',
  [KEYS.BROADCAST_UTC_OFFSET_MINUTES]: 'notification',

  // client — affichage de l'app, renvoyé au client
  [KEYS.HOME_PAGE_SIZE]: 'client',
  [KEYS.HOME_PREFETCH_DISTANCE]: 'client',
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
  // pawaPay : même convention que `payment_fee_percent` — aucun frais inventé.
  [KEYS.PAWAPAY_DEPOSIT_FEE_MTN_PERCENT]: 0,
  [KEYS.PAWAPAY_DEPOSIT_FEE_ORANGE_PERCENT]: 0,
  [KEYS.PAWAPAY_MW_COMMISSION_PERCENT]: 0,
  [KEYS.PAWAPAY_PAYOUT_FEE_MTN_PERCENT]: 0,
  [KEYS.PAWAPAY_PAYOUT_FEE_ORANGE_PERCENT]: 0,
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
  [KEYS.DEFAULT_APP_VERSION]: '1.0.0',
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
  // Build de test : repli à « aucune ». Une clé absente ne doit JAMAIS servir
  // des données de test à une vraie app.
  [KEYS.TEST_APP_VERSION]: [],
  [KEYS.TEST_USER_IDS]: [],
  // Repli fermé : une clé absente ne tolère personne sans jeton.
  [KEYS.TEST_NO_AUTH_VERSIONS]: [],
  [KEYS.TEST_FASTFOOD_VOLUME]: 500,
  // Vide = les clones gardent les images réelles.
  [KEYS.TEST_VOLUME_IMAGE_URL]: '',
  // Plan gratuit de la migration 053 : une clé illisible ne coupe pas l'envoi
  // et n'ouvre pas plus que le plan de base.
  [KEYS.BROADCAST_PLANS]: {
    free: { label: 'Gratuit', dayLimit: 3, weekLimit: 10, audiences: ['customers', 'city', 'all'] },
  },
  [KEYS.BROADCAST_UTC_OFFSET_MINUTES]: 60,
};

module.exports = { KEYS, KEY_CATEGORY, FALLBACKS, categoryOf };
