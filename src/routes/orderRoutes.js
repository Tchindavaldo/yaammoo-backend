const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');
const { updateOrdersConstroller } = require('../controllers/order/updateOrdersConstroller.controller');
const { updateOrdersField } = require('../controllers/order/updateOrdersField.controller');
const { updateOrdersRankByDate } = require('../controllers/order/updateOrdersRankByDate');
const { getDriverOrders } = require('../controllers/order/getDriverOrders');
const { getDeliveryGroup } = require('../controllers/order/getDeliveryGroup');
const { getCancelQuote } = require('../controllers/order/getCancelQuote');
const { getDeliveryCode, confirmDeliveryController } = require('../controllers/order/deliveryCode.controller');
const firebaseAuth = require('../middlewares/authMiddleware');
const { authorize, orderCreate, orderFromBody, ordersFromBody, ordersFromIds, fastfoodFromParam, selfFromParam, orderOwnerFromParam, orderDeliverFromParam } = require('../middlewares/staffPermissionMiddleware');

// Toutes les routes /order exigent le Bearer (elles étaient publiques) — cf. staff.md.

const router = express.Router();

/**
 * @swagger
 * /order/all/{fastFoodId}:
 *   get:
 *     summary: Get all orders for a fastfood
 *     description: >
 *       Ne renvoie que les statuts visibles par le marchand : pending, processing,
 *       finished, delivering, delivered. Exclut pendingToBuy (panier client non
 *       validé) et cancelByUser / cancelByFastFood.
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
router.get('/all/:fastFoodId', firebaseAuth, authorize(fastfoodFromParam), getOrders);

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
router.get('/user/all/:userId', firebaseAuth, authorize(selfFromParam('userId')), getUsersOrders);

/**
 * @swagger
 * /order/delivery-group/{userId}:
 *   get:
 *     summary: Groupage — le client a-t-il déjà payé ce départ (pas encore parti) ?
 *     description: Oui => la course de la nouvelle commande est offerte (cf. orders.md, Groupage).
 *     tags:
 *       - Orders
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *       - { in: query, name: fastFoodId, required: true, schema: { type: string } }
 *       - { in: query, name: zone, required: false, schema: { type: string }, description: "Absent : renvoie data.departures (départs payés non partis de la boutique)" }
 *       - { in: query, name: type, required: true, schema: { type: string, enum: [time, express] } }
 *       - { in: query, name: date, required: true, schema: { type: string } }
 *       - { in: query, name: time, schema: { type: string }, description: Créneau (périodique seulement) }
 *     responses:
 *       200:
 *         description: "{ success, data: { grouped: boolean, orderId: string|null } }"
 */
router.get('/delivery-group/:userId', firebaseAuth, authorize(selfFromParam('userId')), getDeliveryGroup);

/**
 * @swagger
 * /order/cancel-quote/{userId}/{orderId}:
 *   get:
 *     summary: Devis d'annulation par le client (rien n'est écrit)
 *     description: Commande payée encore en attente (pending). Calcul dans order-cancel.md.
 *     tags:
 *       - Orders
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *       - { in: path, name: orderId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "{ success, data: { refund, feesKept, paid, courseKept, manual } }"
 *       409:
 *         description: Commande non annulable (code not_cancellable)
 */
router.get('/cancel-quote/:userId/:orderId', firebaseAuth, authorize(selfFromParam('userId')), getCancelQuote);

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
router.get('/driver/:driverId', firebaseAuth, authorize(selfFromParam('driverId')), getDriverOrders);

/**
 * @swagger
 * /order/{orderId}/delivery-code:
 *   get:
 *     summary: Code de livraison de la commande (client) - contenu du QR code
 *     description: |
 *       Reserve au client de la commande. `whatsappLink` ouvre une discussion avec le numero
 *       WhatsApp de Yaammoo, message prerempli « LIVRE <orderId> <code> » : le marchand sans app
 *       le scanne avec l'appareil photo et l'envoie. Le QR ne paie rien, il prouve la remise.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ success, code, text, whatsappLink }" }
 *       403: { description: Pas le client de la commande }
 */
router.get('/:orderId/delivery-code', firebaseAuth, authorize(orderOwnerFromParam), getDeliveryCode);

/**
 * @swagger
 * /order/{orderId}/confirm-delivery:
 *   post:
 *     summary: Valide la remise d'une commande avec le code du client (scan du QR dans l'app)
 *     description: Boutique (droit orders.deliver) ou livreur assigne. delivering -> delivered.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200: { description: "{ success, message, order } (alreadyDelivered si deja livree)" }
 *       400: { description: Code manquant ou invalide }
 *       409: { description: Commande pas en livraison }
 */
router.post('/:orderId/confirm-delivery', firebaseAuth, authorize(orderDeliverFromParam), confirmDeliveryController);

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
 *       **Bonus livraison** : `bonus` (`{ type, code }`) est un champ d'entrée
 *       facultatif. Le backend rejoue tous les contrôles (code connu, réclamation
 *       approuvée, non expirée, utilisations restantes, boutique correspondante) ;
 *       un code fourni mais invalide fait échouer la commande en 400. L'utilisation
 *       n'est consommée **qu'après création effective** — le user peut donc quitter
 *       l'écran de commande sans rien perdre. Sans `bonus`, le backend retombe sur
 *       le bonus éventuellement **armé** par le user.
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
 *                 description: >-
 *                   Index (base 1) du prix retenu dans `menu.prices[]`. Les colonnes
 *                   prix1/prix2/prix3 sont NULL sur toute la base : `prices[]` fait foi.
 *               bonusCode:
 *                 type: string
 *                 example: YAM-7K3F9QW2
 *                 description: >-
 *                   Code du bonus livraison offerte à appliquer. Entrée seulement :
 *                   non persisté, restitué via `deliveryOffer`. Le backend retrouve
 *                   le bonus (et son type) à partir du code — aucun `type` fourni
 *                   par le client n'est utilisé.
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: boolean }
 *                     prix: { type: number }
 *                     rawPrice:
 *                       type: number
 *                       description: >-
 *                         Prix RÉEL du fastfood, servi par GET /fastfood/all à côté du
 *                         prix affiché. À renvoyer tel quel : il fige le prix de l'époque
 *                         pour la vue marchand. N'entre dans aucun calcul d'argent.
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     status: { type: boolean }
 *                     prix: { type: number }
 *                     rawPrice: { type: number, description: Prix RÉEL du fastfood (cf. extra.rawPrice). }
 *                     quantite: { type: number }
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
router.post('', firebaseAuth, authorize(orderCreate), createOrder);

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
 *               fastFoodId:
 *                 type: string
 *               status:
 *                 type: string
 *                 description: >-
 *                   Statut demandé. La machine à états fait foi (statut lu en base) :
 *                   hors annulation, la commande avance d'un cran. `cancelByUser` (client,
 *                   commande `pending` seulement) ; `cancelByFastFood` (restaurant, avant
 *                   la livraison). Boutique WhatsApp : `cancelByUser` sur une commande
 *                   `pending` n'annule pas, il crée une DEMANDE au marchand
 *                   (`order.cancelRequest`, architecture/order-cancel.md).
 *                 enum: [pending, processing, finished, delivering, delivered, cancelByUser, cancelByFastFood]
 *               driverId:
 *                 type: string
 *                 description: >-
 *                   Délégation livreur (le front n'envoie PAS de status). Si la commande
 *                   n'est pas encore assignée à ce driverId → assignation par le fastFood
 *                   (event driverOrderAssigned). Si elle l'est déjà → le livreur fait
 *                   avancer la commande via la machine à états (finished→delivering→delivered,
 *                   event driverOrderUpdated).
 *     responses:
 *       200:
 *         description: >-
 *           Commande mise à jour. `data` = résultat du service. Demande d'annulation
 *           (boutique WhatsApp) : `data.cancelRequested = true`, `data.data.cancelRequest.status = 'pending'`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: success.
 *                 data:
 *                   type: object
 *                   properties:
 *                     success: { type: boolean }
 *                     message: { type: string }
 *                     cancelRequested: { type: boolean, description: "true = demande d'annulation envoyée au marchand WhatsApp, rien n'est annulé" }
 *                     data:
 *                       $ref: '#/components/schemas/Order'
 *       400:
 *         description: Transition refusée (ex. « Le restaurant a déjà accepté cette commande »), ou statut changé entre-temps (action concurrente)
 *       409:
 *         description: >-
 *           `code: cancel_requested` — app sous `cancel_request_min_app_version` (R11) : la
 *           demande d'annulation est bien envoyée au marchand, le message l'explique.
 */
router.put('', firebaseAuth, authorize(orderFromBody), updateOrder);

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
router.put('/tabs/:userId', firebaseAuth, authorize(ordersFromBody), updateOrdersConstroller);

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
router.put('/update-field', firebaseAuth, authorize(ordersFromIds), updateOrdersField);

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
router.put('/update-rank-by-date/:fastFoodId', firebaseAuth, authorize(fastfoodFromParam), updateOrdersRankByDate);

module.exports = router;
