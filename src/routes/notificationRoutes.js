const express = require('express');
const { sendPushNotificationController } = require('../controllers/notifications/FCM/sendPushNotification.controller');

const router = express.Router();

router.post('', sendPushNotificationController);

module.exports = router;
