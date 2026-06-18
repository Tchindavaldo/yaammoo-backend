// ============================================================================
// reliableEmit — émission socket FIABLE (persistée + rejouable + ACK natif)
// ============================================================================
// Socket.io est fire-and-forget : si l'utilisateur est hors ligne au moment de
// l'émission, l'event est perdu. Pour les events "importants" (wallet, statuts
// de commande, menus), on veut une garantie de livraison.
//
// Principe :
//   1. On PERSISTE l'event dans outbox_events (delivered_at = null).
//   2. On émet avec l'ACK natif Socket.io (callback + timeout).
//      - si le client répond (callback appelé) → on marque delivered_at.
//      - sinon (hors ligne / timeout) → l'event reste en base, il sera rejoué
//        au prochain join_user (cf. socket.js → replayUndelivered).
//
// Le payload émis embarque `__eventId` (id outbox) : le client peut dédoublonner
// entre live et replay (même event jamais traité deux fois).
// ============================================================================

const repos = require('../repositories');

const ACK_TIMEOUT_MS = Number(process.env.SOCKET_ACK_TIMEOUT_MS) || 5000;

/**
 * Émet un event fiable vers un user (room = userId).
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} event
 * @param {object} payload
 */
async function reliableEmit(io, userId, event, payload = {}) {
  if (!io || !userId || !event) return;

  // 1. Persister d'abord (source de vérité pour le rejeu)
  let eventId;
  try {
    eventId = await repos.outboxEvents.create({ userId, event, payload });
  } catch (e) {
    console.error(`[reliableEmit] persistance échouée (${event} → ${userId}): ${e.message}`);
    // On émet quand même en best-effort, mais sans garantie de rejeu.
    io.to(userId).emit(event, payload);
    return;
  }

  const body = { ...payload, __eventId: eventId };

  // 2. Émettre avec ACK natif + timeout. Le client confirme en appelant le callback.
  io.to(userId)
    .timeout(ACK_TIMEOUT_MS)
    .emit(event, body, async err => {
      if (err) {
        // Aucun ACK (hors ligne / pas de handler) → reste à rejouer.
        return;
      }
      try {
        await repos.outboxEvents.markDelivered(eventId);
      } catch (e) {
        console.warn(`[reliableEmit] markDelivered échoué (id=${eventId}): ${e.message}`);
      }
    });
}

/**
 * Rejoue les events non délivrés d'un user (appelé au join_user).
 * Chaque event est ré-émis avec ACK ; on marque délivré dès confirmation.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 */
async function replayUndelivered(io, userId) {
  if (!io || !userId) return;
  let pending;
  try {
    pending = await repos.outboxEvents.getUndelivered(userId);
  } catch (e) {
    console.error(`[reliableEmit] replay: lecture échouée pour ${userId}: ${e.message}`);
    return;
  }
  if (!pending.length) return;

  console.info(`[reliableEmit] replay ${pending.length} event(s) non délivré(s) → ${userId}`);
  for (const ev of pending) {
    const body = { ...ev.payload, __eventId: ev.id, __replay: true };
    io.to(userId)
      .timeout(ACK_TIMEOUT_MS)
      .emit(ev.event, body, async err => {
        if (err) return;
        try {
          await repos.outboxEvents.markDelivered(ev.id);
        } catch (e) {
          console.warn(`[reliableEmit] replay markDelivered échoué (id=${ev.id}): ${e.message}`);
        }
      });
  }
}

module.exports = { reliableEmit, replayUndelivered };
