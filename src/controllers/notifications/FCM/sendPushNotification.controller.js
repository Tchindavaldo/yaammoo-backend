const sendPushNotificationService = require('../../../services/notification/FCM/sendPushNotification.service');

exports.sendPushNotificationController = async (req, res) => {
  const { token, title, body, data } = req.body;

  const result = await sendPushNotificationService({ token, title, body, data });

  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(500).json({ error: result.error });
  }
};
