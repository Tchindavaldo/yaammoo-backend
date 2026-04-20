const admin = require('firebase-admin');
const { db } = require('../../../config/firebase');
const { postNotificationService } = require('../request/postNotification.service');

const getUserTokens = async (userId) => {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    if (Array.isArray(data.fcmTokens)) return data.fcmTokens.filter(Boolean);
    if (typeof data.fcmToken === 'string' && data.fcmToken) return [data.fcmToken];
    return [];
  } catch (e) {
    console.warn('[notifyOrderEvent] getUserTokens error:', e.message);
    return [];
  }
};

const cleanStaleTokens = async (userId, staleTokens) => {
  if (!staleTokens || staleTokens.length === 0) return;
  try {
    await db.collection('users').doc(userId).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
    });
  } catch (e) {
    console.warn('[notifyOrderEvent] cleanStaleTokens error:', e.message);
  }
};

exports.notifyOrderEvent = async ({ targetUserId, type, title, body, orderId, route }) => {
  if (!targetUserId) return { success: false, message: 'targetUserId requis' };
  try {
    const tokens = await getUserTokens(targetUserId);
    const extraFcmData = {
      type: type || '',
      route: route || '',
      orderId: orderId || '',
    };
    const result = await postNotificationService({
      data: { title, body, type },
      userId: targetUserId,
      tokens,
      extraFcmData,
    });
    return result;
  } catch (e) {
    console.error('[notifyOrderEvent] error:', e);
    return { success: false, message: e.message };
  }
};

exports.cleanStaleTokens = cleanStaleTokens;
exports.getUserTokens = getUserTokens;
