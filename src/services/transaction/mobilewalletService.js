// ============================================================================
// mobilewalletService — Client HTTP de MobileWallet (paiements, retraits)
// ============================================================================
// La clé API (`MOBILEWALLET_YAAMMOO_KEY`) ne quitte jamais le serveur : le
// front passe toujours par le backend yaammoo.
//
// Agrégateur : chaque appel nomme l'agrégateur ACTIF (env `PAYMENT_AGGREGATOR`,
// cf. utils/paymentAggregator.js). Sans ce champ, MobileWallet retombe sur
// DigiKUNTZ.
//
// Erreurs : le VRAI code HTTP de MobileWallet est propagé pour ses refus
// métier (400, 409, 422…) — le front n'affiche que `message`. Seuls les
// incidents d'infrastructure deviennent 502 (réseau, 5xx, et 401/403 : un
// problème de clé API côté serveur, que le front ne doit jamais prendre pour
// une session expirée). 503 (opérateur indisponible) reste 503.
// ============================================================================
const axios = require('axios');
const { resolvePaymentAggregator } = require('../../utils/paymentAggregator');
const { toCanonicalNetwork, toPayNetwork } = require('../../utils/mobileNetwork');

const log = console;

const MOBILEWALLET_URL = process.env.MOBILEWALLET_URL || 'http://localhost:7332';
const MOBILEWALLET_YAAMMOO_KEY = process.env.MOBILEWALLET_YAAMMOO_KEY;

// Libellé affiché au payeur dans la demande USSD/PIN (4 à 22 caractères).
const PAY_DESCRIPTION = 'Achat Yaammoo';

if (!MOBILEWALLET_YAAMMOO_KEY) {
  log.warn('⚠️ MOBILEWALLET_YAAMMOO_KEY non configurée. Les paiements Mobile Money échoueront.');
}

const mobilewalletClient = axios.create({
  baseURL: MOBILEWALLET_URL,
  timeout: 120000,
  headers: {
    Authorization: `Bearer ${MOBILEWALLET_YAAMMOO_KEY}`,
    'Content-Type': 'application/json',
  },
});

const callbackUrl = () => `${process.env.BACKEND_URL}/transaction/webhook/mobilewallet`;

/**
 * Normalise une erreur MobileWallet. FastAPI imbrique la charge sous `detail`,
 * qui peut être un objet `{error|code, message}`, une chaîne, ou une liste
 * (validation Pydantic, illisible pour un user → message par défaut).
 */
function toMwError(error, { logPrefix, defaultMessage }) {
  const status = error.response?.status;
  const data = error.response?.data;
  const detail = data?.detail ?? data;
  const obj = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};

  log.error(`${logPrefix} ❌ Erreur HTTP ${status || 'UNKNOWN'}: ${error.message}`);
  if (error.response) log.error(`${logPrefix} Réponse erreur:`, JSON.stringify(data, null, 2));
  else if (error.code) log.error(`${logPrefix} Code erreur: ${error.code} (réseau/timeout?)`);

  const isBusinessRefusal = status >= 400 && status < 500 && status !== 401 && status !== 403;
  const httpStatus = isBusinessRefusal ? status : status === 503 ? 503 : 502;

  const fallbackCode = status === 409 ? 'duplicate' : status === 503 ? 'unavailable' : isBusinessRefusal ? 'rejected' : 'server_error';
  const message = obj.message || (typeof detail === 'string' && isBusinessRefusal ? detail : null) || defaultMessage;

  return {
    success: false,
    status: 'error',
    httpStatus,
    code: obj.error || obj.code || fallbackCode,
    message,
    retry_after_s: obj.retry_after_s,
    last_status: obj.last_status,
  };
}

/**
 * POST /pay — initie un paiement Mobile Money.
 *
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.phone       numéro (sans +237)
 * @param {string} params.network     'MTN' | 'Orangemoney' (forme libre acceptée)
 * @param {string} [params.email]
 * @param {string} [params.mode]
 * @param {string} params.userId      uid Firebase (log/traçabilité)
 * @param {string} params.paymentRef  ID unique de CE paiement (= end_user_ref MW)
 * @param {string} [params.aggregator] agrégateur ; absent = l'actif
 * @returns {Promise<{success, status, transaction_id, message, code, ussd_code, aggregator}>}
 */
exports.pay = async ({ amount, phone, network, email, mode, userId, paymentRef, aggregator }) => {
  const agg = aggregator || resolvePaymentAggregator();
  const payNetwork = toPayNetwork(network) || network;
  const logPrefix = `[MobileWallet API] ${agg} ${payNetwork} amount=${amount}`;

  const payload = {
    amount,
    phone,
    network: payNetwork,
    email: email || 'yaammoo@rauval.com',
    mode: mode || process.env.MOBILEWALLET_MODE || 'browser',
    aggregator: agg,
    description: PAY_DESCRIPTION,
    end_user_ref: paymentRef,
    callback_url: callbackUrl(),
  };

  try {
    log.info(`${logPrefix} → POST ${MOBILEWALLET_URL}/pay (userId=${userId}, phone=${phone})`);
    const startTime = Date.now();
    const response = await mobilewalletClient.post('/pay', payload);
    const { success, status, transaction_id, message, code, ussd_code } = response.data;
    log.info(`${logPrefix} ✓ HTTP ${response.status} en ${Date.now() - startTime}ms: status=${status}, tx_id=${transaction_id}`);

    return { success, status, transaction_id, message, code, ussd_code: ussd_code ?? null, aggregator: agg };
  } catch (error) {
    return toMwError(error, { logPrefix, defaultMessage: 'Le paiement n’a pas pu être initié. Réessayez.' });
  }
};

/**
 * POST /payout — initie un RETRAIT (virement sortant). Réponse immédiate
 * `pending`, verdict par webhook + socket (cf. withdrawals.mw_payout_id).
 *
 * @param {Object} params
 * @param {number} params.amount         montant REÇU par le bénéficiaire
 * @param {string} params.network        réseau du numéro de réception
 * @param {string} params.sourceNetwork  solde MobileWallet débité
 * @param {string} params.phone
 * @param {string} params.receiverName
 * @param {string} [params.narration]
 * @param {string} [params.withdrawalId] traçabilité (end_user_ref)
 * @param {string} [params.aggregator]   absent = l'actif
 * @returns {Promise<{success, status, transaction_id, message, code, fee, total_debited, httpStatus?}>}
 */
exports.payout = async ({ amount, network, sourceNetwork, phone, receiverName, narration, withdrawalId, aggregator }) => {
  const agg = aggregator || resolvePaymentAggregator();
  // Normaliser : strip tout préfixe (+237, 00237) puis préfixer 237
  const normalizedPhone = `237${String(phone).replace(/^\+?(00)?237/, '')}`;
  const logPrefix = `[MobileWallet API] payout ${agg} ${sourceNetwork}→${network} amount=${amount}`;

  // MobileWallet exige 'MTN' | 'ORANGEMONEY' strictement, pour les DEUX champs.
  const payload = {
    amount,
    account_bank_code: toCanonicalNetwork(network),
    source_network: toCanonicalNetwork(sourceNetwork),
    account_number: normalizedPhone,
    receiver_name: receiverName,
    currency: process.env.WITHDRAWAL_CURRENCY || 'XAF',
    narration: narration || 'Retrait yaammoo',
    aggregator: agg,
    callback_url: callbackUrl(),
    end_user_ref: withdrawalId,
  };

  try {
    log.info(`${logPrefix} → POST ${MOBILEWALLET_URL}/payout (withdrawalId=${withdrawalId}, phone=${normalizedPhone})`);
    const startTime = Date.now();
    const response = await mobilewalletClient.post('/payout', payload);
    const { success, status, transaction_id, message, code, fee, total_debited } = response.data;
    log.info(`${logPrefix} ✓ HTTP ${response.status} en ${Date.now() - startTime}ms: status=${status}, tx_id=${transaction_id}, fee=${fee}`);

    return { success, status, transaction_id, message, code, fee: Number(fee) || 0, total_debited: Number(total_debited) || 0 };
  } catch (error) {
    return toMwError(error, { logPrefix, defaultMessage: 'Le retrait n’a pas pu être initié. Réessayez.' });
  }
};

/**
 * GET /payout/quote — frais d'un retrait, SANS rien débiter.
 * Même réseau que la source : 0 (frais prépayés au dépôt). Interréseau : taux
 * du réseau de destination, arrondi à l'excès.
 *
 * @returns {Promise<{success:true, fee:number} | {success:false, httpStatus, code, message}>}
 */
exports.payoutQuote = async ({ amount, network, sourceNetwork, aggregator }) => {
  const agg = aggregator || resolvePaymentAggregator();
  const logPrefix = `[MobileWallet API] quote ${agg} ${sourceNetwork}→${network} amount=${amount}`;
  try {
    const response = await mobilewalletClient.get('/payout/quote', {
      params: {
        amount,
        account_bank_code: toCanonicalNetwork(network),
        source_network: toCanonicalNetwork(sourceNetwork),
        aggregator: agg,
      },
    });
    return { success: true, fee: Math.max(0, Number(response.data?.fee) || 0) };
  } catch (error) {
    return toMwError(error, { logPrefix, defaultMessage: 'Frais de retrait indisponibles. Réessayez.' });
  }
};

/**
 * POST /operators/predict — opérateur d'un numéro saisi librement.
 *
 * @returns {Promise<{success:true, phone:string, network:'MTN'|'ORANGEMONEY'|null} | {success:false, httpStatus, code, message}>}
 */
exports.predictOperator = async ({ phone, aggregator }) => {
  const agg = aggregator || resolvePaymentAggregator();
  const logPrefix = `[MobileWallet API] predict ${agg}`;
  try {
    const response = await mobilewalletClient.post('/operators/predict', { phone, aggregator: agg }, { timeout: 15000 });
    const data = response.data || {};
    return { success: true, phone: data.phone || null, network: toCanonicalNetwork(data.network) };
  } catch (error) {
    return toMwError(error, { logPrefix, defaultMessage: 'Opérateur non reconnu. Vérifiez le numéro.' });
  }
};

module.exports = exports;
