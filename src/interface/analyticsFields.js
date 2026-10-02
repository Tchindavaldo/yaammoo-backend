// ============================================================================
// Champs de POST /analytics/events (migration 061)
// ============================================================================
// Lot d'événements envoyé par l'app : `{ session, events[] }`. L'utilisateur
// est celui du Bearer, jamais un champ du corps. Chaque type d'événement a ses
// champs `data` déclarés ci-dessous. Voir architecture/analytics.md.

exports.MAX_EVENTS_PER_BATCH = 200;

const id = { type: 'string', required: false, maxLength: 64 };
const ms = { type: 'number', required: false, min: 0, max: 86400000 };

exports.analyticsBatchFields = {
  session: { type: 'object', required: true },
  events: { type: 'array', required: true },
};

exports.analyticsSessionFields = {
  // Généré par l'app à chaque ouverture (premier plan).
  id: { type: 'string', required: true, maxLength: 64 },
  startedAt: { type: 'string', required: true, maxLength: 40 },
  // Dernière activité connue ; `endedAt` présent = session close (arrière-plan).
  lastActivityAt: { type: 'string', required: false, maxLength: 40 },
  endedAt: { type: 'string', required: false, maxLength: 40 },
  appVersion: { type: 'string', required: false, maxLength: 20 },
  platform: { type: 'string', required: false, allowedValues: ['ios', 'android', 'web'] },
  osVersion: { type: 'string', required: false, maxLength: 40 },
  deviceModel: { type: 'string', required: false, maxLength: 80 },
};

exports.analyticsEventFields = {
  type: { type: 'string', required: true, maxLength: 40 },
  occurredAt: { type: 'string', required: true, maxLength: 40 },
  fastFoodId: id,
  menuId: id,
  bannerId: id,
  data: { type: 'object', required: false },
};

// `data` autorisé par type d'événement.
exports.analyticsEventDataFields = {
  // Écran quitté, avec le temps passé dessus.
  screen_view: {
    screen: { type: 'string', required: true, maxLength: 60 },
    durationMs: ms,
  },
  // Page du home chargée (1 = première). msSincePrevious = temps passé sur
  // les pages déjà chargées avant de déclencher celle-ci.
  home_page_loaded: {
    page: { type: 'number', required: true, min: 1, max: 1000 },
    itemsCount: { type: 'number', required: false, min: 0, max: 1000 },
    msSincePrevious: ms,
  },
  // Boutique restée visible à l'écran (≥ 50 %) sur le home.
  shop_impression: {
    position: { type: 'number', required: false, min: 0, max: 100000 },
    page: { type: 'number', required: false, min: 1, max: 1000 },
    visibleMs: ms,
  },
  shop_open: {
    source: { type: 'string', required: false, allowedValues: ['home', 'search', 'banner', 'notification', 'other'] },
  },
  menu_open: {},
  add_to_cart: {
    quantity: { type: 'number', required: false, min: 0, max: 1000 },
  },
  checkout_start: {
    total: { type: 'number', required: false, min: 0 },
  },
  payment_result: {
    status: { type: 'string', required: true, allowedValues: ['success', 'failed'] },
    total: { type: 'number', required: false, min: 0 },
  },
  search: {
    query: { type: 'string', required: true, maxLength: 120 },
    resultsCount: { type: 'number', required: false, min: 0, max: 100000 },
  },
  banner_view: {},
  banner_click: {},
};

exports.ANALYTICS_EVENT_TYPES = Object.keys(exports.analyticsEventDataFields);
