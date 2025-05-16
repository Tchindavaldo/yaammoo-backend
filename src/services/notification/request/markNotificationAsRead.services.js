const { db } = require('../../../config/firebase');
const { getNotificationByIdService } = require('./getNotificationById.services');

exports.markNotificationAsReadService = async data => {
  try {
    const { userId, notificationIdGroup, notificationId, io } = data;

    if (!userId || !notificationIdGroup || !notificationId) return { success: false, message: 'param manquant userId || notificationIdGroup || notificationId' };

    const notificationData = await getNotificationByIdService(notificationIdGroup);

    if (!notificationData.success) {
      return { success: false, message: notificationData.message };
    }

    const notification = notificationData.data;
    const notifList = notification.allNotif || [];

    const targetNotifIndex = notifList.findIndex(notif => notif.id === notificationId);

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
    await db.collection('notification').doc(notificationIdGroup).update({ allNotif: notifList });

    // console.log('appeler du iooo', io ? true : false);
    io.to(userId).emit('isRead', { notificationId, userId });
    return { success: true, message: 'Notification marquée comme lue' };
  } catch (error) {
    console.error('Erreur dans markNotificationAsRead:', error);
    return { success: false, message: error.message };
  }
};
