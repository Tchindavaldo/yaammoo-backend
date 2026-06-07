const axios = require('axios');

const log = console;

const MOBILEWALLET_URL = process.env.MOBILEWALLET_URL || 'http://localhost:7332';
const MOBILEWALLET_ADMIN_KEY = process.env.MOBILEWALLET_ADMIN_KEY;

if (!MOBILEWALLET_ADMIN_KEY) {
  log.warn('⚠️ MOBILEWALLET_ADMIN_KEY non configurée. Les paiements Mobile Money échoueront.');
}

const mobilewalletClient = axios.create({
  baseURL: MOBILEWALLET_URL,
  timeout: 30000,
  headers: {
    'X-Admin-Key': MOBILEWALLET_ADMIN_KEY,
    'Content-Type': 'application/json',
  },
});

/**
 * Appel POST /pay sur ai_browser2 (MobileWallet) pour initier un paiement Mobile Money.
 *
 * Logs détaillés:
 *   - Avant: URL, méthode, payload
 *   - Après: status HTTP, temps écoulé, réponse
 *   - Erreur: code erreur, message
 *
 * @param {Object} params
 * @param {number} params.amount - Montant en XAF
 * @param {string} params.phone - Numéro de téléphone (sans +237)
 * @param {string} params.network - 'Orangemoney' ou 'MTN'
 * @param {string} params.email - Email utilisateur
 * @param {string} params.userId - uid Firebase de l'utilisateur
 * @returns {Promise<{success, status, transaction_id, message, code}>}
 */
exports.pay = async ({ amount, phone, network, email, userId }) => {
  const logPrefix = `[MobileWallet API] ${network} amount=${amount}`;

  try {
    const payload = {
      amount,
      phone,
      network,
      email,
      sender_name: 'Yaammoo',
      aggregator: 'digikuntz',
      mode: 'auto',
      fallback_browser: true,
      end_user_ref: userId,
    };

    log.info(
      `${logPrefix} → POST ${MOBILEWALLET_URL}/pay (timeout=30s, userId=${userId}, phone=${phone})`
    );
    log.debug(`${logPrefix} Payload:`, JSON.stringify(payload, null, 2));

    const startTime = Date.now();
    const response = await mobilewalletClient.post('/pay', payload);
    const duration = Date.now() - startTime;

    const { success, status, transaction_id, message, code } = response.data;

    log.info(
      `${logPrefix} ✓ HTTP ${response.status} reçu en ${duration}ms: status=${status}, tx_id=${transaction_id}`
    );
    log.debug(`${logPrefix} Réponse complète:`, JSON.stringify(response.data, null, 2));

    return {
      success: success !== false,
      status,
      transaction_id,
      message: message || 'Paiement initié',
      code,
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;

    log.error(
      `${logPrefix} ❌ Erreur HTTP ${status || 'UNKNOWN'}: ${error.message}`
    );

    if (error.response) {
      log.error(`${logPrefix} Réponse erreur:`, JSON.stringify(data, null, 2));
    } else if (error.code) {
      log.error(`${logPrefix} Code erreur: ${error.code} (réseau/timeout?)`);
    }

    // 409 : doublon (pending_exists, retry_too_soon)
    if (status === 409) {
      log.warn(`${logPrefix} → Doublon détecté: code=${data?.error}, retry_after=${data?.retry_after_s}s`);
      return {
        success: false,
        status: 'error',
        code: data?.error || 'duplicate',
        message: data?.message || 'Paiement en cours ou trop rapproché',
        retry_after_s: data?.retry_after_s,
      };
    }

    // 503 : panne opérateur/réseau
    if (status === 503) {
      log.warn(`${logPrefix} → Service indisponible (opérateur/réseau)`);
      return {
        success: false,
        status: 'error',
        code: data?.code || 'unavailable',
        message: data?.message || 'Opérateur ou réseau indisponible',
      };
    }

    // Autres erreurs
    return {
      success: false,
      status: 'error',
      code: data?.code || 'server_error',
      message: error.message || 'Erreur serveur MobileWallet',
    };
  }
};

module.exports = exports;
