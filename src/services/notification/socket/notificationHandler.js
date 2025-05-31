const { markNotificationAsReadService } = require('../request/markNotificationAsRead.services');

module.exports = (socket, io) => {
  socket.on('isReadNotification', async ({ userId, notificationId, notificationIdGroup }) => {
    // console.log('Notification lue par :', userId);
    // console.log({ userId, notificationId, notificationIdGroup });

    try {
      const result = await markNotificationAsReadService({ userId, notificationId, notificationIdGroup, io });
      // console.log('Résultat du service :', result);
    } catch (err) {
      // console.error('Erreur dans isReadNotification handler :', err.message);
    }
  });
};
