// ============================================================================
// broadcastBonusActivation — Diffusion d'un changement `active` sur un bonus
// ============================================================================
// Activer ou désactiver un bonus change ce que TOUS les users voient dans la
// page bonus : la diffusion est donc globale (socket à tous les clients
// connectés + push), qu'il s'agisse d'un bonus plateforme ou de boutique.
//
// ⚠️ Non bloquant : un échec socket/push ne doit jamais faire échouer le PATCH.
// La vérité reste en base, un simple GET /bonus/all la récupère.
// ============================================================================
const repos = require('../../repositories');
const sendPushNotification = require('../notification/FCM/sendPushNotification.service');
const { getIO } = require('../../socket');

const EVENT = 'bonus.activation_changed';

/**
 * @param {Object} bonus  bonus mis à jour (déjà persisté)
 * @param {boolean} active nouvel état
 */
exports.broadcastBonusActivation = async (bonus, active) => {
  const data = {
    bonusId: bonus.id,
    active,
    type: bonus.type ?? null,
    name: bonus.name ?? null,
    fastFoodId: bonus.fastFoodId ?? null,
    fastFoodName: bonus.fastFoodName ?? null,
    changedAt: new Date().toISOString(),
  };

  // Broadcast à TOUS les sockets connectés : un bonus est visible de tous les
  // users, il n'existe pas de room « app » côté serveur (cf. socket.js).
  try {
    getIO().emit(EVENT, { data });
  } catch (err) {
    console.error('broadcastBonusActivation: émission socket échouée (non bloquant):', err.message);
  }

  // Push : un bonus qui s'ouvre mérite d'être annoncé ; sa fermeture évite au
  // user de compter sur un avantage qui a disparu.
  try {
    const users = await repos.users.getAllUsers();
    const fcm = [];
    const apns = [];
    for (const user of users || []) {
      const tokens = repos.users.collectUserTokens(user);
      fcm.push(...tokens.fcm);
      apns.push(...tokens.apns);
    }
    if (fcm.length === 0 && apns.length === 0) return;

    await sendPushNotification({
      tokens: fcm,
      apnsTokens: apns,
      title: active ? 'Nouveau bonus disponible 🎁' : 'Bonus indisponible',
      body: active ? `${bonus.name} est désormais disponible.` : `${bonus.name} n'est plus disponible.`,
      data: { type: 'Bonus', event: EVENT, bonusId: bonus.id, active: String(active) },
    });
  } catch (err) {
    console.error('broadcastBonusActivation: push échoué (non bloquant):', err.message);
  }
};
