const { db } = require('../../../config/firebase');
const { getNotificationByIdService } = require('./getNotificationById.services');

exports.markNotificationAsReadService = async data => {
  try {
    const { userId, notificationId, notificationCreatedAt } = data;
    console.log(userId, notificationId, notificationCreatedAt);

    if (!userId || !notificationId || !notificationCreatedAt) return { success: false, message: 'param manquant userId || notificationId || notificationCreatedAt' };

    const notificationData = await getNotificationByIdService(notificationId);

    if (!notificationData.success) {
      return { success: false, message: notificationData.message };
    }

    const notification = notificationData.data;
    const notifList = notification.allNotif || [];

    const targetNotifIndex = notifList.findIndex(notif => notif.createdAt === notificationCreatedAt);

    if (targetNotifIndex === -1) {
      return { success: false, message: 'Notification non trouvée dans allNotif' };
    }

    const notifToUpdate = notifList[targetNotifIndex];

    // Initialise isRead s’il n’existe pas
    if (!Array.isArray(notifToUpdate.isRead)) {
      notifToUpdate.isRead = [];
    }

    // Ajouter userId s’il n’est pas encore présent
    if (!notifToUpdate.isRead.includes(userId)) {
      notifToUpdate.isRead.push(userId);
    }

    // Mettre à jour allNotif dans Firestore
    await db.collection('notification').doc(notificationId).update({ allNotif: notifList });

    return { success: true, message: 'Notification marquée comme lue' };
  } catch (error) {
    console.error('Erreur dans markNotificationAsRead:', error);
    return { success: false, message: error.message };
  }
};
