const { postNotificationService } = require('../../../services/notification/request/postNotification.service');

exports.postNotificationController = async (req, res) => {
  try {
    const { userId, fastFoodId } = req.body;
    if (!userId && !fastFoodId) return res.status(400).json({ message: 'parametre manquant' });
    const response = await postNotificationService(req.body, userId || undefined, fastFoodId || undefined);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
