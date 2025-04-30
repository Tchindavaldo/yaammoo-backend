const app = require('./app');
const http = require('http');
const socket = require('./socket');
const socketIo = require('socket.io');
const PORT = process.env.PORT || 5000;

// Création du serveur HTTP
const server = http.createServer(app);

// Configuration de Socket.io
socket.init(server);
server.listen(PORT, () => console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`));
