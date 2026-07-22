const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');
const { updateOrdersConstroller } = require('../controllers/order/updateOrdersConstroller.controller');
const { updateOrdersField } = require('../controllers/order/updateOrdersField.controller');
const { updateOrdersRankByDate } = require('../controllers/order/updateOrdersRankByDate');
const { getDriverOrders } = require('../controllers/order/getDriverOrders');

const router = express.Router();

/**
 * @swagger
 * /order/all/{fastFoodId}:
 *   get:
 *     summary: Get all orders for a fastfood
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: List of orders
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
 *                     $ref: '#/components/schemas/Order'
 */
router.get('/all/:fastFoodId', getOrders);

/**
 * @swagger
 * /order/user/all/{userId}:
 *   get:
 *     summary: Get all orders for a user
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user orders
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
 *                     $ref: '#/components/schemas/Order'
 */
router.get('/user/all/:userId', getUsersOrders);

/**
 * @swagger
 * /order/driver/{driverId}:
 *   get:
 *     summary: Get all orders assigned to a driver
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *         description: Driver (livreur) user ID
 *     responses:
 *       200:
 *         description: List of orders assigned to the driver
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
 *                     $ref: '#/components/schemas/Order'
 */
router.get('/driver/:driverId', getDriverOrders);

/**
 * @swagger
 * /order:
 *   post:
 *     summary: Crée une commande
 *     description: >-
 *       Une commande porte **UN** menu commandé en `quantity` exemplaires — il n'y
 *       a pas de tableau `items`. Le validateur **refuse tout champ non listé**
 *       ci-dessous (`interface/orderFields.js`).
 *
 *       **Bonus livraison** : `bonusCode` est un champ d'entrée facultatif. Le
 *       backend rejoue tous les contrôles (code connu, réclamation approuvée, non
 *       expirée, utilisations restantes, boutique correspondante) ; un code
 *       fourni mais invalide fait échouer la commande en 400. L'utilisation n'est
 *       consommée **qu'après création effective** — le user peut donc quitter
 *       l'écran de commande sans rien perdre. Sans `bonusCode`, le backend
 *       retombe sur le bonus éventuellement **armé** par le user.
 *
 *       ⚠️ Les montants de livraison (`delivery.prix`) restent **inchangés**,
 *       jamais forcés à 0 : la gratuité est portée par `deliveryOffer` dans la
 *       réponse, et c'est le front qui décide de l'affichage.
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, fastFoodId, menu, quantity, total, userData, extra, drink, delivery]
 *             properties:
 *               userId:
 *                 type: string
 *               fastFoodId:
 *                 type: string
 *               menu:
 *                 $ref: '#/components/schemas/Menu'
 *               quantity:
 *                 type: number
 *               total:
 *                 type: number
 *               selectedPriceIndex:
 *                 type: number
 *                 description: Index du prix retenu parmi prix1/prix2/prix3.
 *               bonusCode:
 *                 type: string
 *                 example: YAM-7K3F9QW2
 *                 description: >-
 *                   Code d'un bonus livraison offerte. Entrée seulement : non
 *                   persisté, restitué via `deliveryOffer`.
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: boolean }
 *                     prix: { type: number }
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: boolean }
 *                     prix: { type: number }
 *               userData:
 *                 type: object
 *                 required: [firstName, lastName, email]
 *                 properties:
 *                   firstName: { type: string }
 *                   lastName: { type: string }
 *                   email: { type: string }
 *                   phoneNumber:
 *                     type: number
 *                     description: Requis si `delivery.status` est true.
 *                   photoUrl: { type: string }
 *               delivery:
 *                 $ref: '#/components/schemas/OrderDelivery'
 *               status:
 *                 type: string
 *                 enum: [pendingToBuy, pending, processing, finished, delivering, delivered, cancelByUser, cancelByFastFood]
 *                 description: Défaut `pendingToBuy`.
 *               clientId: { type: string }
 *               clientName: { type: string }
 *               periodKey: { type: string }
 *               driverId: { type: string }
 *     responses:
 *       201:
 *         description: Commande créée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Validation en échec, stock insuffisant, ou code bonus invalide
 */
router.post('', createOrder);

/**
 * @swagger
 * /order:
 *   put:
 *     summary: Update an order
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, preparing, ready, delivering, finished, delivered, cancelled]
 *               driverId:
 *                 type: string
 *                 description: >-
 *                   Délégation livreur (le front n'envoie PAS de status). Si la commande
 *                   n'est pas encore assignée à ce driverId → assignation par le fastFood
 *                   (event driverOrderAssigned). Si elle l'est déjà → le livreur fait
 *                   avancer la commande via la machine à états (finished→delivering→delivered,
 *                   event driverOrderUpdated).
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               totalPrice:
 *                 type: number
 *     responses:
 *       200:
 *         description: Order successfully updated
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
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
router.put('', updateOrder);

/**
 * @swagger
 * /order/tabs/{userId}:
 *   put:
 *     summary: Update orders for a user (tabs)
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Orders successfully updated
 */
router.put('/tabs/:userId', updateOrdersConstroller);

/**
 * @swagger
 * /order/update-field:
 *   put:
 *     summary: Update a specific field on multiple orders
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderIds
 *               - field
 *               - value
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               field:
 *                 type: string
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Orders successfully updated
 */
router.put('/update-field', updateOrdersField);

/**
 * @swagger
 * /order/update-rank-by-date/{fastFoodId}:
 *   put:
 *     summary: Update order ranks by creation date
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: Order ranks successfully updated
 */
router.put('/update-rank-by-date/:fastFoodId', updateOrdersRankByDate);

module.exports = router;
