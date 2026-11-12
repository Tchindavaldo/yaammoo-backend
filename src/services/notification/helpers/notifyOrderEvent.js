// ============================================================================
// notifyOrderEvent — Helper de notification pour les events de commande
// ============================================================================
// Récupère les tokens push d'un user (FCM Android + APNs iOS), envoie la notif,
// nettoie automatiquement les tokens stales détectés par FCM.
// ============================================================================

const repos = require('../../../repositories');
const { postNotificationService } = require('../request/postNotification.service');

const getUserTokens = async userId => {
  try {
    const user = await repos.users.getUserByIdSafe(userId);
    if (!user) return { fcm: [], apns: [] };
    return repos.users.collectUserTokens(user);
  } catch (e) {
    console.warn('[notifyOrderEvent] getUserTokens error:', e.message);
    return { fcm: [], apns: [] };
  }
};

const cleanStaleTokens = async (userId, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    await repos.users.cleanStaleTokens(userId, staleTokens);
  } catch (e) {
    console.warn('[notifyOrderEvent] cleanStaleTokens error:', e.message);
  }
};

/**
 * `sender` (optionnel, `shopSender(fastFood)`) : la boutique qui « parle » au
 * client. Absent pour une notification destinée au marchand.
 * `audience` : 'merchant' (notification de la boutique) ou 'client' (défaut).
 */
exports.notifyOrderEvent = async ({ targetUserId, type, title, body, orderId, route, sender, audience = 'client' }) => {
  if (!targetUserId) return { success: false, message: 'targetUserId requis' };
  try {
    const { fcm, apns } = await getUserTokens(targetUserId);
    const extraFcmData = {
      type: type || '',
      route: route || '',
      orderId: orderId || '',
      audience,
      // Destinataire : l'app ignore le tap si un autre compte est connecté.
      userId: targetUserId,
    };
    const result = await postNotificationService({
      data: { title, body, type, audience },
      userId: targetUserId,
      tokens: fcm,
      apnsTokens: apns,
      extraFcmData,
      sender,
    });

    if (result?.tokensToDelete && result.tokensToDelete.length > 0) {
      await cleanStaleTokens(targetUserId, result.tokensToDelete);
    }

    return result;
  } catch (e) {
    console.error('[notifyOrderEvent] error:', e);
    return { success: false, message: e.message };
  }
};

exports.cleanStaleTokens = cleanStaleTokens;
exports.getUserTokens = getUserTokens;
