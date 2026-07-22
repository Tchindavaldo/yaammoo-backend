// src/routes/fastfoodRoutes.js
const express = require('express');
const { createFastfoodController } = require('../controllers/fastfood/createFastfood');
const { getfastfoodController } = require('../controllers/fastfood/getFastFoods');
const { getfastfood } = require('../controllers/fastfood/getFastFood');
const { updateFastfoodController } = require('../controllers/fastfood/updateFastfood');
const { searchFastfoodController } = require('../controllers/fastfood/searchFastfood');
const { getFastFoodDeliveryStatsController } = require('../controllers/fastfood/getFastFoodDeliveryStats');
const firebaseAuth = require('../middlewares/authMiddleware');
const optionalFirebaseAuth = require('../middlewares/optionalAuthMiddleware');

const route = express.Router();

/**
 * @swagger
 * /fastFood:
 *   post:
 *     summary: Create a new fastfood restaurant
 *     tags:
 *       - FastFood
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - userId
 *             properties:
 *               name:
 *                 type: string
 *               userId:
 *                 type: string
 *               number:
 *                 type: string
 *               momoNumber:
 *                 type: string
 *               whatsappNumber:
 *                 type: string
 *               openTime:
 *                 type: string
 *               closeTime:
 *                 type: string
 *               image:
 *                 type: string
 *               orderLeadTime:
 *                 type: number
 *               advanceDays:
 *                 type: number
 *               pickupAllowed:
 *                 type: boolean
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *               deliveryHours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     hour:
 *                       type: string
 *                     periodic:
 *                       type: boolean
 *                     periodicZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *                     express:
 *                       type: boolean
 *                     expressZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *     responses:
 *       201:
 *         description: FastFood successfully created
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
 *                   $ref: '#/components/schemas/FastFood'
 *       400:
 *         description: Invalid input
 */
route.post('', createFastfoodController);

/**
 * @swagger
 * /fastFood/all:
 *   get:
 *     summary: Liste les boutiques (avec leurs menus)
 *     description: >-
 *       Route **publique à authentification facultative**. Sans token, la réponse
 *       est celle d'avant. Avec un token valide, chaque boutique porte en plus
 *       `deliveryOffer` : l'offre de livraison armée par CE user et applicable
 *       ici (bonus de la boutique, ou bonus plateforme valable partout).
 *
 *       Seules les boutiques ayant au moins un menu sont renvoyées.
 *     tags:
 *       - FastFood
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     responses:
 *       200:
 *         description: Liste des boutiques
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 appleReviewMode:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/FastFood'
 *                       - type: object
 *                         properties:
 *                           menus:
 *                             type: array
 *                             items:
 *                               $ref: '#/components/schemas/Menu'
 *                           deliveryOffer:
 *                             $ref: '#/components/schemas/DeliveryOffer'
 */
route.get('/all', optionalFirebaseAuth, getfastfoodController);

/**
 * @swagger
 * /fastFood/{fastFoodId}:
 *   get:
 *     summary: Get a specific fastfood restaurant by ID
 *     tags:
 *       - FastFood
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FastFood details
 *   post:
 *     summary: Update a fastfood restaurant
 *     tags:
 *       - FastFood
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               number:
 *                 type: string
 *               momoNumber:
 *                 type: string
 *               whatsappNumber:
 *                 type: string
 *               openTime:
 *                 type: string
 *               closeTime:
 *                 type: string
 *               image:
 *                 type: string
 *               orderLeadTime:
 *                 type: number
 *               advanceDays:
 *                 type: number
 *               pickupAllowed:
 *                 type: boolean
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *               deliveryHours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     hour:
 *                       type: string
 *                     periodic:
 *                       type: boolean
 *                     periodicZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *                     express:
 *                       type: boolean
 *                     expressZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *     responses:
 *       200:
 *         description: FastFood successfully updated
 */
/**
 * @swagger
 * /fastFood/search:
 *   get:
 *     summary: Rechercher une boutique par nom (option « Devenir livreur »)
 *     tags:
 *       - FastFood
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Terme de recherche (nom de boutique)
 *     responses:
 *       200:
 *         description: Liste de StoreOption { id, nom }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nom:
 *                         type: string
 */
route.get('/search', searchFastfoodController);

/**
 * @swagger
 * /fastFood/{fastFoodId}/delivery-stats:
 *   get:
 *     summary: Stats de livraison du fastFood (auto-livraison), adaptées au demandeur
 *     description: >
 *       Le fastFood peut livrer lui-même (order.driverId = fastFoodId). Renvoie des stats
 *       dont le détail dépend de l'appelant (token) : le marchand propriétaire → stats GLOBALES
 *       de ses auto-livraisons (`scope: self`) ; un client de la boutique → SES stats avec
 *       cette boutique + `hasRated`/`canRate` (`scope: client`). Tout autre demandeur → 403.
 *     tags: [FastFood]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stats livraison (champ `scope` = self | client)
 *       401: { description: Non authentifié }
 *       403: { description: Ni propriétaire ni client de la boutique }
 *       404: { description: FastFood non trouvé }
 */
route.get('/:fastFoodId/delivery-stats', firebaseAuth, getFastFoodDeliveryStatsController);

route.get('/:fastFoodId', getfastfood);
route.post('/:fastFoodId', updateFastfoodController);

module.exports = route;
