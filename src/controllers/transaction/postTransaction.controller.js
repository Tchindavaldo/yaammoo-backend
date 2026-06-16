const { postTransactionService } = require('../../services/transaction/postTransaction.service');

const log = console;

exports.postTransactionController = async (req, res) => {
  try {
    log.info('[POST /transaction] Données reçues du frontend:');
    log.info(JSON.stringify(req.body, null, 2));

    const response = await postTransactionService(req.body);

    if (!response.success) {
      log.warn('[POST /transaction] ❌ Erreurs:', response.message);
    } else {
      log.info('[POST /transaction] ✓ Succès');
    }

    return res.status(response.success ? 200 : response.httpStatus || 400).json(response);
  } catch (error) {
    log.error('[POST /transaction] ❌ Exception:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
