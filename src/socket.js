const notificationHandler = require('./services/notification/socket/notificationHandler');
const { replayUndelivered } = require('./utils/reliableEmit');
const repos = require('./repositories');

// src/socket.js
let io;
const readNotificationsBuffer = [];

// Purge périodique de l'outbox (events délivrés + non délivrés > TTL).
const OUTBOX_PURGE_INTERVAL_MS = Number(process.env.OUTBOX_PURGE_INTERVAL_MS) || 6 * 60 * 60 * 1000; // 6h

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
        if (!userId) return;
        socket.join(userId);
        // Reprise : rejouer les events fiables manqués pendant la déconnexion.
        replayUndelivered(io, userId).catch(e => console.warn('[socket] replay error:', e.message));
      });

      notificationHandler(socket, io);
    });

    // Purge périodique de l'outbox
    setInterval(() => {
      repos.outboxEvents.purge().catch(e => console.warn('[socket] outbox purge error:', e.message));
    }, OUTBOX_PURGE_INTERVAL_MS).unref?.();

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.io non initialisé !');
    }
    return io;
  },
};
