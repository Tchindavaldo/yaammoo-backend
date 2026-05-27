// ============================================================================
// markNotificationAsReadService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../../repositories');

exports.markNotificationAsReadService = async (data) => {
  try {
    const { userId, notificationIdGroup, notificationId, io } = data;

    if (!userId || !notificationIdGroup || !notificationId) {
      return { success: false, message: 'param manquant userId || notificationIdGroup || notificationId' };
    }

    const updated = await repos.notifications.markAsRead({
      groupId: notificationIdGroup,
      notifId: notificationId,
      userId,
    });

    if (!updated) return { success: false, message: 'Notification non trouvée' };

    if (io) io.to(userId).emit('isRead', { notificationId, userId });
    return { success: true, message: 'Notification marquée comme lue' };
  } catch (error) {
    console.error('Erreur dans markNotificationAsRead:', error);
    return { success: false, message: error.message };
  }
};
