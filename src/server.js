const app = require('./app');
const http = require('http');
const socket = require('./socket');
const socketIo = require('socket.io');
const { startKeepAlive } = require('./utils/supabaseKeepAlive');
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;

// Création du serveur HTTP
const server = http.createServer(app);

// Configuration de Socket.io
socket.init(server);
// Lancement du Keep-Alive pour Supabase (2-3 fois par semaine)
startKeepAlive(72);

server.listen(PORT, HOST, () => console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`));
