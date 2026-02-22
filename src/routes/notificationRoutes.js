const express = require('express');
const { sendPushNotificationController } = require('../controllers/notifications/FCM/sendPushNotification.controller');
const { postNotificationController } = require('../controllers/notifications/request/postNotification.controller');
const { getNotificationsController } = require('../controllers/notifications/request/getNotifications.controller');
const { getNotificationController } = require('../controllers/notifications/request/getNotification.controller');
const { markNotificationAsReadController } = require('../controllers/notifications/request/markNotificationAsRead.controller');

const router = express.Router();

/**
 * @swagger
 * /notification:
 *   post:
 *     summary: Send a push notification
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification successfully sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input
 */
router.post('', sendPushNotificationController);

/**
 * @swagger
 * /notification/add:
 *   post:
 *     summary: Add a notification to database
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *               - message
 *             properties:
 *               userId:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification successfully added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Notification'
 *       400:
 *         description: Invalid input
 */
router.post('/add', postNotificationController);

/**
 * @swagger
 * /notification/get:
 *   get:
 *     summary: Get a specific notification
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Notification'
 */
router.get('/get', getNotificationController);

/**
 * @swagger
 * /notification/user:
 *   get:
 *     summary: Get all notifications for a user
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 */
router.get('/user', getNotificationsController);

/**
 * @swagger
 * /notification/markAsRead:
 *   put:
 *     summary: Mark a notification as read
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notificationId
 *             properties:
 *               notificationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification successfully marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.put('/markAsRead', markNotificationAsReadController);

module.exports = router;
