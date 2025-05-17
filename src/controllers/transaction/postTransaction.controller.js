const { postTransactionService } = require('../../services/transaction/postTransaction.service');

exports.postTransactionController = async (req, res) => {
  try {
    const response = await postTransactionService(req.body);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
