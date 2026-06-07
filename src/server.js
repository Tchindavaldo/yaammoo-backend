const app = require('./app');
const http = require('http');
const socket = require('./socket');
const socketIo = require('socket.io');
const { startKeepAlive } = require('./utils/supabaseKeepAlive');
const { initMobileWalletSocket } = require('./services/transaction/mobilewalletSocketClient');
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;

// Création du serveur HTTP
const server = http.createServer(app);

// Configuration de Socket.io
socket.init(server);
// Lancement du Keep-Alive pour Supabase (toutes les 4h)
startKeepAlive(4);

// Connexion vers MobileWallet en tant que client Socket.io
// (pour recevoir les événements de verdict de paiement)
initMobileWalletSocket();

server.listen(PORT, HOST, () => console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`));
