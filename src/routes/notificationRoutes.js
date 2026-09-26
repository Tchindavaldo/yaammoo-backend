const express = require('express');
const { sendPushNotificationController } = require('../controllers/notifications/FCM/sendPushNotification.controller');
const { postNotificationController } = require('../controllers/notifications/request/postNotification.controller');
const { getNotificationsController } = require('../controllers/notifications/request/getNotifications.controller');
const { getNotificationController } = require('../controllers/notifications/request/getNotification.controller');
const { markNotificationAsReadController } = require('../controllers/notifications/request/markNotificationAsRead.controller');
const { getBroadcastStateController, sendBroadcastController } = require('../controllers/notifications/broadcast/broadcast.controller');
const firebaseAuth = require('../middlewares/authMiddleware');
const adminGuard = require('../middlewares/adminMiddleware');
const { requireFastfoodPermission } = require('../middlewares/staffPermissionMiddleware');

const router = express.Router();

// Envoi libre (n'importe quel destinataire, n'importe quel texte) : réservé aux
// administrateurs. Ces deux routes étaient PUBLIQUES — sans compte, on pouvait
// pousser une notification à n'importe quel utilisateur. L'app n'y fait aucun
// appel : les services internes passent par `postNotificationService`.
const adminOnly = [firebaseAuth, adminGuard];

// Notifications d'une boutique : propriétaire, admin, ou employé ayant
// `notifications.send`.
const canBroadcast = [firebaseAuth, requireFastfoodPermission('notifications.send')];

/**
 * @swagger
 * /notification:
 *   post:
 *     summary: Send a push notification (admin)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Bearer manquant ou invalide
 *       403:
 *         description: Réservé aux administrateurs
 */
router.post('', ...adminOnly, sendPushNotificationController);

/**
 * @swagger
 * /notification/add:
 *   post:
 *     summary: Add a notification to database (admin)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Bearer manquant ou invalide
 *       403:
 *         description: Réservé aux administrateurs
 */
router.post('/add', ...adminOnly, postNotificationController);

/**
 * @swagger
 * /notification/broadcast/{fastFoodId}:
 *   get:
 *     summary: Plan, villes desservies et derniers envois d'une boutique
 *     description: >
 *       Plan d'envoi (quota jour / semaine, audiences autorisées), villes
 *       desservies par la boutique (audience `city`), et envois du plus récent
 *       au plus ancien — au moins toute la semaine en cours.
 *       Propriétaire, admin, ou employé ayant `notifications.send`.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           `{ success, data: { plan: { key, label, dayLimit, weekLimit, audiences[] },
 *           cities: string[], items: [{ id, fastFoodId, title, body?, imageUrl?,
 *           audience, city?, plan, recipientsCount, pushedCount, sentAt }] } }`
 *       401: { description: Bearer manquant ou invalide }
 *       403: { description: Pas d'accès à la boutique, ou permission notifications.send absente }
 *       404: { description: Boutique introuvable }
 *   post:
 *     summary: Envoyer une notification aux clients de la boutique
 *     description: >
 *       Refusé (429) si le quota du jour ou de la semaine du plan est atteint,
 *       (403) si l'audience n'est pas dans le plan, (400) si la ville n'est pas
 *       desservie. Réponse immédiate ; la diffusion (fil, push, socket) se fait
 *       ensuite, en arrière-plan.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, audience]
 *             properties:
 *               title: { type: string, maxLength: 50 }
 *               body: { type: string, maxLength: 150 }
 *               imageUrl: { type: string, description: URL https publique }
 *               audience: { type: string, enum: [customers, city, all] }
 *               city: { type: string, description: Requise si audience = city }
 *     responses:
 *       201: { description: "`{ success, data: <envoi> }`" }
 *       400: { description: Payload invalide ou ville non desservie }
 *       401: { description: Bearer manquant ou invalide }
 *       403: { description: Permission absente, ou audience hors plan }
 *       404: { description: Boutique introuvable }
 *       429: { description: Quota du jour ou de la semaine atteint }
 */
router.get('/broadcast/:fastFoodId', ...canBroadcast, getBroadcastStateController);
router.post('/broadcast/:fastFoodId', ...canBroadcast, sendBroadcastController);

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
