const express = require('express');
const { sendPushNotificationController } = require('../controllers/notifications/FCM/sendPushNotification.controller');
const { postNotificationController } = require('../controllers/notifications/request/postNotification.controller');
const { getNotificationsController } = require('../controllers/notifications/request/getNotifications.controller');
const { getNotificationController } = require('../controllers/notifications/request/getNotification.controller');
const { markNotificationAsReadController } = require('../controllers/notifications/request/markNotificationAsRead.controller');

const router = express.Router();

router.post('', sendPushNotificationController);
router.post('/add', postNotificationController);
router.get('/get', getNotificationController);
router.get('/user', getNotificationsController);
router.put('/markAsRead', markNotificationAsReadController);

module.exports = router;
