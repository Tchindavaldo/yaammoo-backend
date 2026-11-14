// ============================================================================
// broadcastService — Notifications envoyées par une boutique
// ============================================================================
// GET  : plan (quota + audiences), villes desservies, derniers envois.
// POST : contrôle audience / ville, insertion SOUS QUOTA (atomique), réponse
//        immédiate, puis diffusion asynchrone (`broadcastFanout`).
// Voir architecture/notifications-broadcast.md.
// ============================================================================
const repos = require('../../../repositories');
const { generateId } = require('../../../repositories/idGen');
const { resolvePlan, quotaWindow } = require('./broadcastPlan');
const { fanOutBroadcast } = require('./broadcastFanout');
const { getHiddenFastfoodIds } = require('../../settings/settings.service');

/** Envois renvoyés au minimum : l'écran affiche les derniers + la semaine. */
const HISTORY_MIN = 30;

const AUDIENCE_LABELS = { customers: 'vos clients', city: 'cette ville', all: 'tous les utilisateurs' };

/** Vue publique d'un envoi : l'uid de l'expéditeur reste côté serveur. */
const publicItem = ({ senderUid, ...item }) => item;

exports.getBroadcastState = async fastFoodId => {
  const fastFood = await repos.fastfoodBroadcasts.getFastfoodContext(fastFoodId);
  if (!fastFood) return { status: 404, message: 'Boutique introuvable.' };

  const plan = await resolvePlan(fastFood.plan);
  // La semaine entière doit être présente : le client en déduit barres et quota.
  const items = await repos.fastfoodBroadcasts.listRecent(fastFoodId, Math.max(HISTORY_MIN, plan.weekLimit));

  return {
    status: 200,
    data: { plan, cities: fastFood.cities, items: items.map(publicItem) },
  };
};

/**
 * @param {{ fastFoodId: string, senderUid: string, payload: object }} input
 *        `payload` déjà validé (`validateBroadcast`).
 */
exports.sendBroadcast = async ({ fastFoodId, senderUid, payload }) => {
  const fastFood = await repos.fastfoodBroadcasts.getFastfoodContext(fastFoodId);
  if (!fastFood) return { status: 404, message: 'Boutique introuvable.' };

  const plan = await resolvePlan(fastFood.plan);
  if (!plan.audiences.includes(payload.audience)) {
    return {
      status: 403,
      message: `Le plan ${plan.label} ne permet pas d’écrire à ${AUDIENCE_LABELS[payload.audience]}.`,
    };
  }

  // Boutique masquée (review Apple) : jamais d'envoi hors de ses propres clients,
  // sinon le compte de review écrirait à de vrais utilisateurs.
  if (payload.audience !== 'customers' && (await getHiddenFastfoodIds()).has(fastFoodId)) {
    return { status: 403, message: 'Cette boutique ne peut écrire qu’à ses clients.' };
  }

  const city = payload.audience === 'city' ? payload.city.trim() : null;
  if (city && !fastFood.cities.includes(city)) {
    return { status: 400, message: `La boutique ne dessert pas ${city}.` };
  }

  const { dayStart, weekStart } = await quotaWindow();
  const result = await repos.fastfoodBroadcasts.insertUnderQuota({
    id: generateId(),
    fastFoodId,
    senderUid,
    title: payload.title.trim(),
    body: payload.body?.trim() || null,
    imageUrl: payload.imageUrl || null,
    audience: payload.audience,
    city,
    plan: plan.key,
    dayStart,
    weekStart,
    dayLimit: plan.dayLimit,
    weekLimit: plan.weekLimit,
    // Plafond propre à l'audience (migration 070) : null = quota global seul.
    audienceDayLimit: plan.audienceLimits[payload.audience]?.dayLimit ?? null,
    audienceWeekLimit: plan.audienceLimits[payload.audience]?.weekLimit ?? null,
  });

  if (!result.ok) {
    const target = AUDIENCE_LABELS[payload.audience];
    const messages = {
      week: 'Quota de la semaine atteint.',
      day: 'Quota du jour atteint.',
      audience_week: `Quota de la semaine atteint pour ${target}.`,
      audience_day: `Quota du jour atteint pour ${target}.`,
    };
    return { status: 429, message: messages[result.reason] || messages.day };
  }

  // Après la réponse : la diffusion peut prendre du temps (milliers de push).
  setImmediate(() => fanOutBroadcast({ item: result.item, fastFood }));

  return { status: 201, data: publicItem(result.item) };
};
