const { postNotificationService } = require('../../../services/notification/request/postNotification.service');

exports.postNotificationController = async (req, res) => {
  try {
    const { userId, fastFoodId, token } = req.body;
    const data = { data: req.body, userId: userId || undefined, fastFoodId: fastFoodId || undefined, token: token || undefined };
    if (!userId && !fastFoodId) return res.status(400).json({ message: 'parametre manquant' });
    const response = await postNotificationService(data);
    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la récupération des bonus.' });
  }
};
