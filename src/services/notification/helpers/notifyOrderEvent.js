const admin = require('firebase-admin');
const { db } = require('../../../config/firebase');
const { postNotificationService } = require('../request/postNotification.service');
const userService = require('../../user/userService');

/**
 * Récupère les tokens push d'un utilisateur en split FCM / APNs.
 * Lit en priorité user.pushTokens (nouveau format) avec fallback legacy fcmTokens.
 */
const getUserTokens = async (userId) => {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return { fcm: [], apns: [] };
    return userService.collectUserTokens(doc.data() || {});
  } catch (e) {
    console.warn('[notifyOrderEvent] getUserTokens error:', e.message);
    return { fcm: [], apns: [] };
  }
};

const cleanStaleTokens = async (userId, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    // Nettoie pushTokens (objets)
    if (Array.isArray(data.pushTokens)) {
      const filtered = data.pushTokens.filter((e) => e && !staleTokens.includes(e.token));
      await userRef.update({ pushTokens: filtered });
    }
    // Nettoie fcmTokens legacy
    await userRef.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
    });
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

    // Cleanup tokens invalides détectés lors de l'envoi
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
