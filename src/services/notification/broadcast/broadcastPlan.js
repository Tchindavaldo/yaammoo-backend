// ============================================================================
// broadcastPlan — Plan d'envoi d'une boutique et bornes de quota
// ============================================================================
// Les plans vivent dans le réglage `broadcast_plans` (settings_notification,
// migration 053) : `{ <clé>: { label, dayLimit, weekLimit, audiences[] } }`.
// La clé d'une boutique est `fastfoods.broadcast_plan` ('free' par défaut).
// ============================================================================
const { getSettings, KEYS } = require('../../settings/settings.service');
const { BROADCAST_AUDIENCES } = require('../../../interface/broadcastFields');

const FREE_PLAN_KEY = 'free';
const DAY_MS = 86400000;

const toLimit = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Plan effectif d'une boutique. Clé inconnue (plan retiré, faute de frappe) →
 * plan gratuit : un changement de catalogue ne doit pas couper l'envoi.
 * Aucun plan lisible → limites à 0, donc envoi refusé plutôt qu'illimité.
 */
exports.resolvePlan = async planKey => {
  const settings = await getSettings();
  const raw = settings[KEYS.BROADCAST_PLANS];
  const plans = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const key = plans[planKey] ? planKey : FREE_PLAN_KEY;
  const plan = plans[key] || {};

  return {
    key,
    label: typeof plan.label === 'string' && plan.label ? plan.label : key,
    dayLimit: toLimit(plan.dayLimit),
    weekLimit: toLimit(plan.weekLimit),
    audiences: (Array.isArray(plan.audiences) ? plan.audiences : []).filter(a => BROADCAST_AUDIENCES.includes(a)),
  };
};

/**
 * Début du jour et de la semaine (lundi) courants, dans le fuseau du réglage
 * `broadcast_utc_offset_minutes`, exprimés en instants UTC.
 */
exports.quotaWindow = async (now = new Date()) => {
  const settings = await getSettings();
  const raw = Number(settings[KEYS.BROADCAST_UTC_OFFSET_MINUTES]);
  const offsetMs = (Number.isFinite(raw) ? raw : 60) * 60000;

  const local = new Date(now.getTime() + offsetMs);
  const dayStartLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;

  return {
    dayStart: new Date(dayStartLocal - offsetMs),
    weekStart: new Date(dayStartLocal - daysSinceMonday * DAY_MS - offsetMs),
  };
};
