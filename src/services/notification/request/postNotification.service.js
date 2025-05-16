const { db } = require('../../../config/firebase');
const { getIO } = require('../../../socket');
const { flattenNotifications } = require('../../../utils/flattenNotifications');
const { validateNotificationData } = require('../../../utils/validator/validateNotificationData');
const sendPushNotification = require('../FCM/sendPushNotification.service');
const { getNotificationService } = require('./getNotification.services');

exports.postNotificationService = async dataGet => {
  try {
    const { data, userId, fastFoodId, token } = dataGet;
    // ✅ Valider les données
    const errors = validateNotificationData(data);
    if (errors.length > 0) return { success: false, message: errors };

    const response = await getNotificationService(userId || undefined, fastFoodId || undefined);
    const newNotif = { id: db.collection('notification').doc().id, title: data.title, body: data.body, type: data.type, isRead: [], createdAt: new Date().toISOString() };

    if (!response.data || response.data.length === 0) {
      const notificationData1 = {};
      if (fastFoodId && userId) return { success: false, message: 'notification ne doit pas avoir userId et fastFoodId' };

      if (userId) notificationData1.userId = userId;
      if (fastFoodId) notificationData1.target = 'all';
      if (fastFoodId) notificationData1.fastFoodId = fastFoodId;

      const notificationData = { ...notificationData1, updatedAt: new Date().toISOString(), allNotif: [newNotif] };

      const docRef = await db.collection('notification').add(notificationData);
      const newUserNotif = { ...notificationData1, idGroup: docRef.id, ...newNotif, isRead: JSON.stringify(newNotif.isRead) };

      if (token) await sendPushNotification({ token, title: newNotif.title, body: newNotif.body, data: newUserNotif });
      return { success: true, data: { id: docRef.id, ...notificationData }, message: 'Notification ajoutée avec succès' };
    } else {
      const notifDoc = response.data[0];
      const updatedAllNotifArray = [newNotif, ...notifDoc.allNotif];

      const notificationData1 = {};
      if (notifDoc.userId) notificationData1.userId = notifDoc.userId;
      if (notifDoc.target) notificationData1.target = notifDoc.target;
      if (notifDoc.fastFoodId) notificationData1.fastFoodId = notifDoc.fastFoodId;
      notificationData1.updatedAt = new Date().toISOString();

      await db.collection('notification').doc(notifDoc.id).update({ allNotif: updatedAllNotifArray, updatedAt: new Date().toISOString() });

      const newUserNotif = { ...notificationData1, idGroup: notifDoc.id, ...newNotif, isRead: JSON.stringify(newNotif.isRead) };
      if (token) await sendPushNotification({ token, title: newNotif.title, body: newNotif.body, data: newUserNotif });

      return { success: true, data: { ...notifDoc, allNotif: updatedAllNotifArray }, message: 'Notification ajoutée avec succès' };
    }
  } catch (error) {
    console.error('Erreur dans postNotificationService:', error);
    return { success: false, message: error.message };
  }
};

// io.emit('newbonus', { message: 'Nouveau bonus', data: docRef });
