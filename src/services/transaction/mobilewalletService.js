const axios = require('axios');

const log = console;

const MOBILEWALLET_URL = process.env.MOBILEWALLET_URL || 'http://localhost:7332';
const MOBILEWALLET_YAAMMOO_KEY = process.env.MOBILEWALLET_YAAMMOO_KEY;

if (!MOBILEWALLET_YAAMMOO_KEY) {
  log.warn('⚠️ MOBILEWALLET_YAAMMOO_KEY non configurée. Les paiements Mobile Money échoueront.');
}

const mobilewalletClient = axios.create({
  baseURL: MOBILEWALLET_URL,
  timeout: 30000,
  headers: {
    Authorization: `Bearer ${MOBILEWALLET_YAAMMOO_KEY}`,
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
exports.pay = async ({ amount, phone, network, email, mode, userId }) => {
  const finalEmail = email || 'yaammoo@rauval.com';
  const finalMode = mode || 'replay';

  // Construire l'URL du callback webhook (depuis env)
  const backendUrl = process.env.BACKEND_URL;
  const callbackUrl = `${backendUrl}/transaction/webhook/mobilewallet`;

  const logPrefix = `[MobileWallet API] ${network} amount=${amount}`;

  try {
    const payload = {
      amount,
      phone,
      network,
      email: finalEmail,
      mode: finalMode,
      end_user_ref: userId,
      callback_url: callbackUrl,
    };

    log.info(`${logPrefix} → POST ${MOBILEWALLET_URL}/pay (timeout=30s, userId=${userId}, phone=${phone})`);
    log.debug(`${logPrefix} Payload:`, JSON.stringify(payload, null, 2));

    const startTime = Date.now();
    const response = await mobilewalletClient.post('/pay', payload);
    const duration = Date.now() - startTime;

    const { success, status, transaction_id, message, code, payment_number } = response.data;

    log.info(`${logPrefix} ✓ HTTP ${response.status} reçu en ${duration}ms: success=${success}, status=${status}, tx_id=${transaction_id}`);
    log.debug(`${logPrefix} Réponse complète:`, JSON.stringify(response.data, null, 2));

    return {
      success,
      status,
      transaction_id,
      message,
      code,
      payment_number,
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    // FastAPI (MobileWallet) imbrique la charge d'erreur sous `detail`.
    // On retombe sur `data` à plat si jamais le format change. Anti-corruption layer.
    const detail = data?.detail || data;

    log.error(`${logPrefix} ❌ Erreur HTTP ${status || 'UNKNOWN'}: ${error.message}`);

    if (error.response) {
      log.error(`${logPrefix} Réponse erreur:`, JSON.stringify(data, null, 2));
    } else if (error.code) {
      log.error(`${logPrefix} Code erreur: ${error.code} (réseau/timeout?)`);
    }

    // 409 : doublon (pending_exists, retry_too_soon)
    if (status === 409) {
      log.warn(`${logPrefix} → Doublon détecté: code=${detail?.error}, retry_after=${detail?.retry_after_s}s`);
      return {
        success: false,
        status: 'error',
        httpStatus: 409,
        code: detail?.error || 'duplicate',
        message: detail?.message || 'Paiement en cours ou trop rapproché',
        retry_after_s: detail?.retry_after_s,
        last_status: detail?.last_status,
      };
    }

    // 503 : panne opérateur/réseau
    if (status === 503) {
      log.warn(`${logPrefix} → Service indisponible (opérateur/réseau)`);
      return {
        success: false,
        status: 'error',
        httpStatus: 503,
        code: detail?.code || detail?.error || 'unavailable',
        message: detail?.message || 'Opérateur ou réseau indisponible',
      };
    }

    // Autres erreurs
    return {
      success: false,
      status: 'error',
      httpStatus: 502,
      code: detail?.code || detail?.error || 'server_error',
      message: detail?.message || error.message || 'Erreur serveur MobileWallet',
    };
  }
};

module.exports = exports;
