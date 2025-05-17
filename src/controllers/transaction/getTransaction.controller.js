const { getTransactionService, getTransactionByIdService } = require('../../services/transaction/getTransaction.services');

exports.getTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const response = await getTransactionService(userId);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des transactions' });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await getTransactionByIdService(id);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération de la transaction' });
  }
};
