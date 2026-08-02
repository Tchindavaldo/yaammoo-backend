const { postSupportThreadService } = require('../../services/support/postSupportThread.service');

exports.postSupportThreadController = async (req, res) => {
  try {
    const response = await postSupportThreadService(req.body);
    return res.status(response.success ? 201 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la création de la discussion.' });
  }
};
