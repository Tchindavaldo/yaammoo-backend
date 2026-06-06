const axios = require('axios');

const MOBILEWALLET_URL = process.env.MOBILEWALLET_URL || 'http://localhost:7332';
const MOBILEWALLET_ADMIN_KEY = process.env.MOBILEWALLET_ADMIN_KEY;

if (!MOBILEWALLET_ADMIN_KEY) {
  console.warn('⚠️ MOBILEWALLET_ADMIN_KEY non configurée. Les paiements Mobile Money échoueront.');
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
 * Appel POST /pay sur ai_browser2 pour initier un paiement Mobile Money.
 * @param {Object} params
 * @param {number} params.amount - Montant en XAF
 * @param {string} params.phone - Numéro de téléphone (sans +237)
 * @param {string} params.network - 'Orangemoney' ou 'MTN'
 * @param {string} params.email - Email utilisateur
 * @param {string} params.userId - uid Firebase de l'utilisateur
 * @returns {Promise<{status, transaction_id, message}>}
 */
exports.pay = async ({ amount, phone, network, email, userId }) => {
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

    const response = await mobilewalletClient.post('/pay', payload);
    const { success, status, transaction_id, message, code } = response.data;

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

    // 409 : doublon (pending_exists, retry_too_soon)
    if (status === 409) {
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
      return {
        success: false,
        status: 'error',
        code: data?.code || 'unavailable',
        message: data?.message || 'Opérateur ou réseau indisponible',
      };
    }

    // Autres erreurs
    console.error('Erreur appel ai_browser2 /pay:', error.message, data);
    return {
      success: false,
      status: 'error',
      code: 'server_error',
      message: error.message || 'Erreur serveur',
    };
  }
};

module.exports = exports;
