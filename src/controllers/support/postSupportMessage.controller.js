const { postSupportMessageService } = require('../../services/support/postSupportMessage.service');

exports.postSupportMessageController = async (req, res) => {
  try {
    const response = await postSupportMessageService(req.params.id, req.body);
    const status = response.success ? 201 : response.notFound ? 404 : 400;
    return res.status(status).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Erreur serveur lors de l'envoi du message." });
  }
};
