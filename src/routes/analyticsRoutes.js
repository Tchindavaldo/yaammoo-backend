const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { authorize, adminOnly } = require('../middlewares/staffPermissionMiddleware');
const ctrl = require('../controllers/analytics/analytics.controller');

const router = express.Router();
const admin = [firebaseAuth, authorize(adminOnly)];

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Statistiques d'usage (envoi par l'app, lecture admin). Voir architecture/analytics.md.
 */

/**
 * @swagger
 * /analytics/events:
 *   post:
 *     summary: Lot d'événements d'usage de l'utilisateur connecté
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session, events]
 *             properties:
 *               session:
 *                 type: object
 *                 required: [id, startedAt]
 *                 properties:
 *                   id: { type: string }
 *                   startedAt: { type: string, format: date-time }
 *                   lastActivityAt: { type: string, format: date-time }
 *                   endedAt: { type: string, format: date-time }
 *                   appVersion: { type: string }
 *                   platform: { type: string, enum: [ios, android, web] }
 *                   osVersion: { type: string }
 *                   deviceModel: { type: string }
 *               events:
 *                 type: array
 *                 maxItems: 200
 *                 items:
 *                   type: object
 *                   required: [type, occurredAt]
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [screen_view, home_page_loaded, shop_impression, shop_open, menu_open, add_to_cart, checkout_start, payment_result, search, banner_view, banner_click]
 *                     occurredAt: { type: string, format: date-time }
 *                     fastFoodId: { type: string }
 *                     menuId: { type: string }
 *                     bannerId: { type: string }
 *                     data: { type: object, description: "Champs propres au type (interface/analyticsFields.js)" }
 *     responses:
 *       201: { description: "{ data: { received } }" }
 *       400: { description: Payload invalide }
 *       404: { description: Utilisateur absent }
 */
router.post('/events', firebaseAuth, ctrl.recordAnalyticsEvents);

/**
 * @swagger
 * /analytics/online:
 *   get:
 *     summary: Utilisateurs connectés maintenant (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: { count, users: [{ userId, since, devices, appVersion, platform }] } }" }
 *
 * /analytics/connections:
 *   get:
 *     summary: Historique des connexions (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: userId, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time }, description: "Défaut : 30 jours avant to" }
 *       - { in: query, name: to, schema: { type: string, format: date-time }, description: "Défaut : maintenant" }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 1000 }, description: "Défaut : 100" }
 *     responses:
 *       200: { description: "{ data: [{ id, userId, connectedAt, disconnectedAt, appVersion, platform }] }" }
 *
 * /analytics/connections/stats:
 *   get:
 *     summary: Par utilisateur — nombre de connexions, première / dernière, temps connecté, en ligne (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ userId, connectionCount, firstConnectedAt, lastConnectedAt, totalConnectedS, online }] }" }
 *
 * /analytics/sessions/stats:
 *   get:
 *     summary: Par utilisateur — sessions, temps total / moyen dans l'app (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ userId, sessions, totalMs, avgMs, lastSessionAt }] }" }
 *
 * /analytics/home-scroll:
 *   get:
 *     summary: Par utilisateur — pages du home chargées, page max, boutiques vues, temps avant la page suivante (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ userId, pagesLoaded, maxPage, shopsSeen, avgMsBeforeNextPage }] }" }
 *
 * /analytics/shops:
 *   get:
 *     summary: Par boutique — affichages, personnes, temps visible moyen, ouvertures (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ fastfoodId, impressions, viewers, avgVisibleMs, opens, menuOpens, addToCart }] }" }
 *
 * /analytics/funnel:
 *   get:
 *     summary: Entonnoir commande (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ step, users, events }] }" }
 *
 * /analytics/searches:
 *   get:
 *     summary: Termes recherchés les plus fréquents (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ query, searches, users, zeroResults }] }" }
 *
 * /analytics/banners:
 *   get:
 *     summary: Vues et clics par bannière (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ bannerId, views, clicks, viewers, clickers }] }" }
 *
 * /analytics/daily:
 *   get:
 *     summary: Série par jour (heure de Douala, jours vides inclus) (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ data: [{ day, activeUsers, sessions, totalMs, connections, homePages, impressions, shopOpens, addToCart, checkouts, paymentsSuccess, searches }] }" }
 *
 * /analytics/events:
 *   get:
 *     summary: Événements bruts filtrés (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: userId, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string } }
 *       - { in: query, name: fastFoodId, schema: { type: string } }
 *     responses:
 *       200: { description: "{ data: [{ id, userId, sessionId, type, fastfoodId, menuId, bannerId, data, occurredAt }] }" }
 *
 * /analytics/users/{userId}:
 *   get:
 *     summary: Fiche d'un utilisateur — connexions, sessions, scroll du home, derniers événements (admin)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ data: { userId, connectionCount, lastConnectedAt, online, sessions, homeScroll, events } }" }
 */
router.get('/online', ...admin, ctrl.getOnlineUsers);
router.get('/connections', ...admin, ctrl.getConnections);
router.get('/connections/stats', ...admin, ctrl.aggregate('connection_stats'));
router.get('/sessions/stats', ...admin, ctrl.aggregate('session_stats'));
router.get('/home-scroll', ...admin, ctrl.aggregate('home_scroll'));
router.get('/shops', ...admin, ctrl.aggregate('shop_views'));
router.get('/funnel', ...admin, ctrl.aggregate('funnel'));
router.get('/searches', ...admin, ctrl.aggregate('top_searches'));
router.get('/banners', ...admin, ctrl.aggregate('banners'));
router.get('/daily', ...admin, ctrl.aggregate('daily'));
router.get('/events', ...admin, ctrl.getEvents);
router.get('/users/:userId', ...admin, ctrl.getUserSummary);

module.exports = router;
