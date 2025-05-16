const { markNotificationAsReadService } = require('../../../services/notification/request/markNotificationAsRead.services');
const { getIO } = require('../../../socket');

exports.markNotificationAsReadController = async (req, res) => {
  try {
    const io = getIO();
    const response = await markNotificationAsReadService({ ...req.body, io });
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
