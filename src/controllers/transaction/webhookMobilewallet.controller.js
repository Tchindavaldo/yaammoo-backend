const { mwVerdictService } = require('../../services/transaction/mwVerdictService');

const log = console;
exports.webhookMobilewalletController = async (req, res) => {
  const logPrefix = '[Webhook Controller]';

  try {
    log.info(`${logPrefix} → Webhook reçu de MobileWallet`);

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { type, data } = payload;
    const { transaction_id, status } = data || {};

    log.info(
      `${logPrefix} Payload: type=${type}, tx_id=${transaction_id}, status=${status}`
    );
    log.debug(`${logPrefix} Payload complet:`, JSON.stringify(payload, null, 2));

    log.info(`${logPrefix} → Appel mwVerdictService...`);
    await mwVerdictService(payload);
    log.info(`${logPrefix} ✓ Service complété`);

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
