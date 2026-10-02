// ============================================================================
// analyticsIngest — Lot d'événements envoyé par l'app (POST /analytics/events)
// ============================================================================
// 1. Met à jour la session (`analytics_sessions`) : dernière activité, fin, durée.
// 2. Ajoute les événements à `analytics_events` (jamais dédoublonnés).
// Les heures du téléphone hors fenêtre plausible sont remplacées par l'heure
// serveur (`resolveCapturedAt`, partagé avec la localisation).
// ============================================================================
const repos = require('../../repositories');
const { generateId } = require('../../repositories/idGen');
const { resolveCapturedAt } = require('../user/userLocation.service');

const latest = dates => dates.reduce((a, b) => (new Date(b) > new Date(a) ? b : a));

/**
 * @param {string} userId uid du Bearer
 * @param {{session: object, events: object[]}} batch payload validé
 */
exports.ingestAnalyticsBatch = async (userId, { session, events }) => {
  const occurred = events.map(e => resolveCapturedAt(e.occurredAt));
  const startedAt = resolveCapturedAt(session.startedAt);
  const endedAt = session.endedAt ? resolveCapturedAt(session.endedAt) : null;
  const lastActivityAt = latest([
    startedAt,
    ...occurred,
    ...(session.lastActivityAt ? [resolveCapturedAt(session.lastActivityAt)] : []),
    ...(endedAt ? [endedAt] : []),
  ]);
  const durationMs = Math.max(0, new Date(endedAt || lastActivityAt) - new Date(startedAt));

  const saved = await repos.analytics.upsertSession({
    userId,
    session: { ...session, startedAt, lastActivityAt, endedAt, durationMs },
  });
  if (!saved) return { status: 404, message: 'Utilisateur non trouvé.' };

  await repos.analytics.insertEvents(
    events.map((e, i) => ({
      id: generateId(),
      user_id: userId,
      session_id: session.id,
      type: e.type,
      fastfood_id: e.fastFoodId || null,
      menu_id: e.menuId || null,
      banner_id: e.bannerId || null,
      data: e.data || {},
      occurred_at: occurred[i],
    }))
  );

  return { status: 201, data: { received: events.length } };
};
