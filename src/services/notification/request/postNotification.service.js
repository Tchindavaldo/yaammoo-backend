const { db } = require('../../../config/firebase');
const { validateNotificationData } = require('../../../utils/validator/validateNotificationData');
const { getNotificationService } = require('./getNotification.services');

exports.postNotificationService = async (data, userId, fastFoodId) => {
  try {
    // ✅ Valider les données
    const errors = validateNotificationData(data);
    if (errors.length > 0) return { success: false, message: errors };

    const response = await getNotificationService(userId || undefined, fastFoodId || undefined);
    const newNotif = { title: data.title, body: data.body, type: data.type, isRead: false, createdAt: new Date().toISOString() };

    if (!response.data || response.data.length === 0) {
      const notificationData = { updatedAt: new Date().toISOString(), allNotif: [newNotif] };

      if (userId) notificationData.userId = userId;
      if (fastFoodId) notificationData.target = 'all';
      if (fastFoodId) notificationData.fastFoodId = fastFoodId;
      if (fastFoodId && userId) return { success: false, message: 'notification ne doit pas avoir userId et fastFoodId' };

      const docRef = await db.collection('notification').add(notificationData);
      return { success: true, data: { id: docRef.id, ...notificationData }, message: 'Notification ajoutée avec succès' };
    } else {
      const notifDoc = response.data[0];
      const updatedAllNotifArray = [newNotif, ...notifDoc.allNotif];

      await db.collection('notification').doc(notifDoc.id).update({ allNotif: updatedAllNotifArray, updatedAt: new Date().toISOString() });
      return { success: true, data: { ...notifDoc, allNotif: updatedAllNotifArray }, message: 'Notification ajoutée avec succès' };
    }
  } catch (error) {
    console.error('Erreur dans postNotificationService:', error);
    return { success: false, message: error.message };
  }
};

// io.emit('newbonus', { message: 'Nouveau bonus', data: docRef });
