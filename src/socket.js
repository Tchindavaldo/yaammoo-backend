const { markNotificationAsReadService } = require('./services/notification/request/markNotificationAsRead.services');

// src/socket.js
let io;
const readNotificationsBuffer = [];

module.exports = {
  init: server => {
    io = require('socket.io')(server, {
      cors: {
        origin: '*',
        methods: ['*'],
        allowedHeaders: ['*'],
        credentials: true,
      },
    });

    io.on('connection', socket => {
      // console.log('🟢 Client connecté ddd:', socket.id);
      socket.on('join_user', userId => {
        socket.join(userId);
        // console.log(`🔐 Socket ${socket.id} a rejoint la room user: ${userId}`);
      });
      socket.on('disconnect', () => {
        // console.log('🔴 Client déconnecté :', socket.id);
      });

      socket.on('isReadNotification', async ({ userId, notificationId, notificationCreatedAt }) => {
        console.log('Notification lue par :', userId);
        console.log({ userId, notificationId, notificationCreatedAt });
        readNotificationsBuffer.push({ userId, notificationId, notificationCreatedAt });

        // Si tu veux ensuite appeler un service :
        // await markNotificationAsReadService({ userId, notificationId, notificationCreatedAt });
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.io non initialisé !');
    }
    return io;
  },
};
