const notificationHandler = require('./services/notification/socket/notificationHandler');

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

      // ➕ Utilise le handler ici
      notificationHandler(socket, io);
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
