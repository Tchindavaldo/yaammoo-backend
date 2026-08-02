const { markSupportThreadReadService } = require('../../services/support/markSupportThreadRead.service');

exports.markSupportThreadReadController = async (req, res) => {
  try {
    const response = await markSupportThreadReadService(req.params.id, req.query.side);
    const status = response.success ? 200 : response.notFound ? 404 : 400;
    return res.status(status).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors du marquage comme lu.' });
  }
};
