const app = require('./app');
const http = require('http');
const socket = require('./socket');
const socketIo = require('socket.io');
const { startKeepAlive } = require('./utils/supabaseKeepAlive');
const { initMobileWalletSocket } = require('./services/transaction/mobilewalletSocketClient');
const { startFastfoodPurgeJob } = require('./utils/fastfoodPurgeJob');
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

// Purge des boutiques supprimées dont la rétention est écoulée (migration 047)
startFastfoodPurgeJob();
require('./utils/orderAutoCancelJob').startOrderAutoCancelJob();
require('./utils/accountPurgeJob').startAccountPurgeJob();
require('./utils/smsFeeJob').startSmsFeeJob();
// Rappel WhatsApp des nouvelles commandes sans réponse (boutique WhatsApp, migration 087)
require('./utils/whatsappReminderJob').startWhatsappReminderJob();
// Rétention des conversations de l'agent IA WhatsApp (migration 090)
require('./utils/whatsappAiPurgeJob').startWhatsappAiPurgeJob();

server.listen(PORT, HOST, () => console.log(`Serveur lancé sur http://localhost:${PORT}`));
