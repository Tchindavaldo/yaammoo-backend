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
      socket.on('join_user', userId => {
        socket.join(userId);
      });

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
