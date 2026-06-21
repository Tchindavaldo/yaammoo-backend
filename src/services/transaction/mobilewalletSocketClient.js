const io = require('socket.io-client');
const { mwVerdictService } = require('./mwVerdictService');

const log = console;

let mobilewalletSocket = null;
let reconnectTimer = null;

const MOBILEWALLET_URL = process.env.MOBILEWALLET_URL || 'http://localhost:7332';
const MOBILEWALLET_YAAMMOO_KEY = process.env.MOBILEWALLET_YAAMMOO_KEY;

/**
 * Initialiser la connexion Socket.io vers MobileWallet en tant que client.
 *
 * Flux:
 *   1. Se connecter avec auth token (clé API)
 *   2. Écouter l'événement 'transaction.update' sur la room app:{app_id}
 *   3. Traiter le verdict reçu via mwVerdictService (idempotence)
 *   4. Gérer les reconnexions automatiques
 */
function initMobileWalletSocket() {
  if (mobilewalletSocket) {
    log.warn('[MobileWallet Socket] Connexion déjà active, skip');
    return;
  }

  if (!MOBILEWALLET_YAAMMOO_KEY) {
    log.warn('⚠️ MOBILEWALLET_YAAMMOO_KEY non configurée. Les événements Socket de MobileWallet ne seront pas reçus.');
    return;
  }

  log.info(`[MobileWallet Socket] Initialisation connexion vers ${MOBILEWALLET_URL}`);
  log.info(`[MobileWallet Socket] Auth avec Bearer token: ${MOBILEWALLET_YAAMMOO_KEY.substring(0, 15)}...`);

  mobilewalletSocket = io(MOBILEWALLET_URL, {
    auth: {
      token: MOBILEWALLET_YAAMMOO_KEY,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  // =========================================================================
  // ÉVÉNEMENTS DE CONNEXION
  // =========================================================================
  mobilewalletSocket.on('connect', () => {
    log.info('[MobileWallet Socket] ✓ Connecté à MobileWallet');

    // MobileWallet envoie automatiquement les événements de l'app
    // via le token d'authentification (pas besoin de join_app)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  mobilewalletSocket.on('disconnect', (reason) => {
    log.warn(`[MobileWallet Socket] Déconnecté: ${reason}`);

    // Planifier une tentative de reconnexion
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        if (!mobilewalletSocket || !mobilewalletSocket.connected) {
          log.info('[MobileWallet Socket] Tentative reconnexion...');
        }
      }, 5000);
    }
  });

  mobilewalletSocket.on('connect_error', (error) => {
    log.error(`[MobileWallet Socket] ❌ Erreur connexion: ${error.message}`);
  });

  // =========================================================================
  // ÉVÉNEMENT PRINCIPAL: transaction.update
  // =========================================================================
  /**
   * Format attendu du payload MobileWallet:
   * {
   *   "id": "evt_<tx_id>_<status>",
   *   "type": "transaction.successful",
   *   "created": <timestamp>,
   *   "data": {
   *     "transaction_id": "...",
   *     "status": "successful",
   *     "amount": 10000,
   *     "network": "orange",
   *     "phone": "+237...",
   *     "end_user_ref": "...",
   *     "provider_transaction_id": "...",
   *     "app_id": <app_id>
   *   }
   * }
   */
  mobilewalletSocket.on('transaction.update', async (eventPayload) => {
    const logPrefix = '[MobileWallet Socket] transaction.update';

    try {
      const { type, data } = eventPayload;
      const { transaction_id, status } = data;

      log.info(`${logPrefix} → Événement reçu: type=${type}, tx_id=${transaction_id}, status=${status}`);
      log.debug(`${logPrefix} Payload complet:`, JSON.stringify(eventPayload, null, 2));

      // Transformer en format attendu par mwVerdictService
      const webhookPayload = {
        type,
        data: {
          transaction_id,
          status,
          end_user_ref: data.end_user_ref,
          amount: data.amount,
          network: data.network,
          phone: data.phone,
          provider_transaction_id: data.provider_transaction_id,
        },
      };

      // Traiter via le service (idempotence garantie)
      log.info(`${logPrefix} → Appel mwVerdictService...`);
      await mwVerdictService(webhookPayload, 'socket');
      log.info(`${logPrefix} ✓ Événement traité`);
    } catch (error) {
      log.error(`${logPrefix} ❌ Erreur traitement: ${error.message}`, error);
      // Ne pas relancer (socket doit continuer à écouter)
    }
  });

  // =========================================================================
  // AUTRES ÉVÉNEMENTS
  // =========================================================================
  mobilewalletSocket.on('error', (error) => {
    log.error(`[MobileWallet Socket] ❌ Erreur: ${error}`);
  });

  return mobilewalletSocket;
}

/**
 * Arrêter la connexion Socket vers MobileWallet (gracefully)
 */
function closeMobileWalletSocket() {
  if (mobilewalletSocket) {
    log.info('[MobileWallet Socket] Fermeture connexion');
    mobilewalletSocket.disconnect();
    mobilewalletSocket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Obtenir le socket client (pour debug/test)
 */
function getMobileWalletSocket() {
  return mobilewalletSocket;
}

module.exports = {
  initMobileWalletSocket,
  closeMobileWalletSocket,
  getMobileWalletSocket,
};
