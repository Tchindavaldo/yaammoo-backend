// ============================================================================
// notifyOrderEvent — Helper de notification pour les events de commande
// ============================================================================
// Récupère les tokens push d'un user (FCM Android + APNs iOS), envoie la notif,
// nettoie automatiquement les tokens stales détectés par FCM.
// ============================================================================

const repos = require('../../../repositories');
const { postNotificationService } = require('../request/postNotification.service');

const getUserTokens = async (userId) => {
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

exports.notifyOrderEvent = async ({ targetUserId, type, title, body, orderId, route }) => {
  if (!targetUserId) return { success: false, message: 'targetUserId requis' };
  try {
    const { fcm, apns } = await getUserTokens(targetUserId);
    const extraFcmData = {
      type: type || '',
      route: route || '',
      orderId: orderId || '',
    };
    const result = await postNotificationService({
      data: { title, body, type },
      userId: targetUserId,
      tokens: fcm,
      apnsTokens: apns,
      extraFcmData,
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
