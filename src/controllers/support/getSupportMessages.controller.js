const { getSupportMessagesService } = require('../../services/support/getSupportMessages.service');

exports.getSupportMessagesController = async (req, res) => {
  try {
    const response = await getSupportMessagesService(req.params.id);
    const status = response.success ? 200 : response.notFound ? 404 : 400;
    return res.status(status).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des messages.' });
  }
};
