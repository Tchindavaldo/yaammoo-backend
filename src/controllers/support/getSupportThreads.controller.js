const { getSupportThreadsService } = require('../../services/support/getSupportThreads.service');

exports.getSupportThreadsController = async (req, res) => {
  try {
    const { userId, fastFoodId, scope } = req.query;
    const response = await getSupportThreadsService({ userId, fastFoodId, scope });
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des discussions.' });
  }
};
