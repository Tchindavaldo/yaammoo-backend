const crypto = require('crypto');
const { webhookMobilewalletService } = require('../../services/transaction/webhookMobilewallet.service');

const log = console;

/**
 * Webhook entrant d'ai_browser2 pour confirmer le verdict du paiement.
 *
 * Flux:
 *   1. Log d'arrivée du webhook
 *   2. Valide signature HMAC (X-MobileWallet-Signature)
 *   3. Parse payload JSON
 *   4. Appelle service (qui gère l'idempotence)
 *   5. Répond 200 OK (même en cas d'erreur, pour éviter retries)
 *
 * Signature HMAC-SHA256 : X-MobileWallet-Signature: t=<ts>,v1=<hex>
 * où <hex> = HMAC(secret, '<ts>.<raw_body>')
 */
exports.webhookMobilewalletController = async (req, res) => {
  const logPrefix = '[Webhook Controller]';

  try {
    // =========================================================================
    // 1. VÉRIFIER SIGNATURE
    // =========================================================================
    log.info(`${logPrefix} → Webhook reçu de MobileWallet`);

    const signature = req.get('X-MobileWallet-Signature');
    if (!signature) {
      log.warn(`${logPrefix} ❌ Signature manquante`);
      return res.status(400).json({ success: false, message: 'Signature manquante' });
    }

    log.debug(`${logPrefix} Signature header: ${signature}`);

    const webhookSecret = process.env.MOBILEWALLET_WEBHOOK_SECRET;
    if (!webhookSecret) {
      log.error(`${logPrefix} ❌ MOBILEWALLET_WEBHOOK_SECRET non configurée`);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }

    // Parse signature : t=<timestamp>,v1=<hex>
    const sigParts = signature.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=');
      acc[key.trim()] = val.trim();
      return acc;
    }, {});

    const ts = sigParts.t;
    const v1 = sigParts.v1;

    if (!ts || !v1) {
      log.warn(`${logPrefix} ❌ Signature malformée (ts ou v1 manquant)`);
      return res.status(400).json({ success: false, message: 'Signature invalide' });
    }

    // Récupérer le raw body (string, pas JSON parsé)
    const rawBody = req.rawBody || Buffer.from(req.body).toString();

    // Recalculer HMAC
    log.debug(`${logPrefix} Calcul HMAC: ts=${ts}, rawBody length=${rawBody.length}`);
    const mac = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');

    if (mac !== v1) {
      log.warn(`${logPrefix} ❌ Signature invalide (HMAC mismatch)`);
      log.debug(`${logPrefix} Calculé: ${mac}, Reçu: ${v1}`);
      return res.status(401).json({ success: false, message: 'Signature invalide' });
    }

    log.info(`${logPrefix} ✓ Signature HMAC valide`);

    // =========================================================================
    // 2. PARSER PAYLOAD
    // =========================================================================
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { type, data } = payload;
    const { transaction_id, status } = data || {};

    log.info(
      `${logPrefix} Payload: type=${type}, tx_id=${transaction_id}, status=${status}`
    );
    log.debug(`${logPrefix} Payload complet:`, JSON.stringify(payload, null, 2));

    // =========================================================================
    // 3. TRAITER LE WEBHOOK
    // =========================================================================
    log.info(`${logPrefix} → Appel webhookMobilewalletService...`);
    await webhookMobilewalletService(payload);
    log.info(`${logPrefix} ✓ Service complété`);

    // =========================================================================
    // 4. RÉPONDRE 200 OK (même en cas d'erreur)
    // =========================================================================
    // Important: retourner 200 immédiatement pour éviter que MobileWallet
    // ne reretry indéfiniment. Les erreurs sont loggées et non bloquantes.
    log.info(`${logPrefix} ✓ Webhook traité, réponse 200 OK`);
    return res.status(200).json({ success: true, message: 'Webhook reçu et traité' });
  } catch (error) {
    // Erreur de traitement : on log mais on retourne 200 quand même
    // pour éviter les boucles infinies de retry
    log.error(
      `${logPrefix} ❌ Erreur traitement: ${error.message}`,
      error
    );

    // Retourner 200 même en cas d'erreur (évite retries inutiles)
    // Le webhook sera rejouabilisé manuellement via les logs
    return res.status(200).json({
      success: false,
      message: error.message,
      note: 'Erreur loggée, webhook reçu (200 OK pour éviter retry)',
    });
  }
};
