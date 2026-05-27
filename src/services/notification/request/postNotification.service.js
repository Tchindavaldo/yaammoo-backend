// ============================================================================
// postNotificationService — Façade vers l'orchestrateur
// ============================================================================
// Logique conservée à l'identique :
//   1. Append (ou crée) un groupe de notifications pour le user/fastfood
//   2. Envoie push (FCM Android/Expo + APNs iOS)
//   3. Cleanup des tokens stales détectés par FCM
//   4. Emet socket 'newNotification' au target
// ============================================================================

const repos = require('../../../repositories');
const { getIO } = require('../../../socket');
const { validateNotificationData } = require('../../../utils/validator/validateNotificationData');
const sendPushNotification = require('../FCM/sendPushNotification.service');

exports.postNotificationService = async (dataGet) => {
  try {
    const { data, userId, fastFoodId, token, tokens, apnsTokens, extraFcmData = {} } = dataGet;
    const fcmTargets = Array.isArray(tokens) && tokens.length > 0
      ? tokens
      : (token ? [token] : []);
    const apnsTargets = Array.isArray(apnsTokens) ? apnsTokens.filter(Boolean) : [];

    if (fastFoodId && userId) {
      return { success: false, message: 'notification ne doit pas avoir userId et fastFoodId' };
    }

    const errors = validateNotificationData(data);
    if (errors.length > 0) {
      console.log(`Validation échouée: ${errors.join(', ')}`);
      return { success: false, message: errors };
    }

    const sendPushToAll = async (title, body, pushData) => {
      if (fcmTargets.length === 0 && apnsTargets.length === 0) {
        return { tokensToDelete: [] };
      }
      const result = await sendPushNotification({
        tokens: fcmTargets,
        apnsTokens: apnsTargets,
        title,
        body,
        data: pushData,
      });
      const tokensToDelete = result?.tokensToDelete || [];
      if (userId && tokensToDelete.length > 0) {
        try {
          await repos.users.cleanStaleTokens(userId, tokensToDelete);
        } catch (e) {
          console.error('Erreur lors du nettoyage des tokens stales:', e.message);
        }
      }
      return { tokensToDelete };
    };

    const newNotif = {
      id: repos.notifications.generateNotifId(),
      title: data.title,
      body: data.body,
      type: data.type,
      isRead: [],
      createdAt: new Date().toISOString(),
    };

    // Append (ou crée) le groupe de notifications
    const target = userId ? null : (fastFoodId ? 'all' : null);
    const groupDoc = await repos.notifications.appendNotification({
      userId: userId || null,
      fastFoodId: fastFoodId || null,
      target,
      notif: newNotif,
    });

    const baseUserNotif = {};
    if (groupDoc.userId) baseUserNotif.userId = groupDoc.userId;
    if (groupDoc.target) baseUserNotif.target = groupDoc.target;
    if (groupDoc.fastFoodId) baseUserNotif.fastFoodId = groupDoc.fastFoodId;

    const newUserNotif = {
      ...baseUserNotif,
      idGroup: groupDoc.id,
      ...newNotif,
      isRead: JSON.stringify(newNotif.isRead),
    };

    await sendPushToAll(newNotif.title, newNotif.body, { ...newUserNotif, ...extraFcmData });

    try {
      const io = getIO();
      const ioTarget = userId || fastFoodId;
      if (ioTarget) {
        io.to(ioTarget).emit('newNotification', {
          notification: { ...newUserNotif, ...extraFcmData },
        });
      }
    } catch (e) {
      console.error('Erreur socket:', e.message);
    }

    return {
      success: true,
      data: { ...groupDoc },
      message: 'Notification ajoutée avec succès',
    };
  } catch (error) {
    console.error('Erreur dans postNotificationService:', error);
    return { success: false, message: error.message };
  }
};
