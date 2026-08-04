const { postTransactionService } = require('../../services/transaction/postTransaction.service');

const log = console;

exports.postTransactionController = async (req, res) => {
  try {
    // Résumé seulement : dumper `req.body` en entier noyait les logs sous le
    // détail de chaque commande (menu, images, extras…). Le détail utile au
    // diagnostic est déjà tracé, ligne par ligne, par `validatePaymentAmount`.
    const { amount, payBy, userId, items } = req.body || {};
    log.info(`[POST /transaction] payBy=${payBy} userId=${userId} amount=${amount} items=${Array.isArray(items) ? items.length : 0}`);

    const response = await postTransactionService(req.body, req);

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
