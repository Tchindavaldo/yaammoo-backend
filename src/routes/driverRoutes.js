const express = require('express');
const { apply, getApplicationsController, getDriversController, getStoresController, getMyApplicationsController, removeDriverController, decide, getDriverProfileController } = require('../controllers/driver/driverController');
const firebaseAuth = require('../middlewares/authMiddleware');
const { authorize, selfFromBody, selfFromParam, fastfoodFromParam, driverApplicationFromParam, driverRemove } = require('../middlewares/staffPermissionMiddleware');
const { rateDriverController, getDriverRatingsController } = require('../controllers/rating/rateDriver.controller');
const { recordDriverLocationController, getOrderTrackingController } = require('../controllers/driver/driverLocation.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Drivers
 *     description: Candidatures et gestion des livreurs d'un fastFood
 */

/**
 * @swagger
 * /driver/apply:
 *   post:
 *     summary: Postuler pour devenir livreur d'un fastFood
 *     tags:
 *       - Drivers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - fastFoodIds
 *             properties:
 *               userId:
 *                 type: string
 *               fastFoodIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Une demande pending est créée par boutique
 *     responses:
 *       201:
 *         description: Demande(s) créée(s). data = { created[], skipped[] }
 *       400:
 *         description: Champs manquants
 *       404:
 *         description: Utilisateur introuvable
 *       409:
 *         description: Aucune nouvelle demande (déjà en attente/livreur)
 */
router.post('/apply', firebaseAuth, authorize(selfFromBody('userId')), apply);

/**
 * @swagger
 * /driver/location:
 *   post:
 *     summary: Position du livreur en course (suivi temps réel)
 *     description: |
 *       Envoyée toutes les ~10 s par l'app du livreur tant qu'il a une commande
 *       `delivering`. Le livreur est celui du Bearer. La position écrase la
 *       précédente (`driver_positions`) et part à chaque client concerné par
 *       socket `driverLocationUpdated` `{ data: { driverId, latitude, longitude,
 *       accuracy, speed, heading, capturedAt, orderIds[] } }`. Sans course en
 *       cours, rien n'est stocké et `activeDeliveries` vaut 0.
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               accuracy: { type: number, minimum: 0, description: m }
 *               speed: { type: number, minimum: 0, description: m/s }
 *               heading: { type: number, minimum: 0, maximum: 360, description: degrés, 0 = nord }
 *               capturedAt: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: "data = { activeDeliveries: number }"
 *       400:
 *         description: Payload invalide
 *       401:
 *         description: Token manquant ou invalide
 */
router.post('/location', firebaseAuth, recordDriverLocationController);

/**
 * @swagger
 * /driver/tracking/{orderId}:
 *   get:
 *     summary: État de suivi d'une commande (onglet « Suivi » du client)
 *     description: |
 *       Réservé au client de la commande, à son livreur et au propriétaire de
 *       la boutique. `driver` et `destination` ne sont renseignés que pour une
 *       commande `delivering` assignée à un livreur. `destination` = dernière
 *       position connue du client.
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: |
 *           data = { orderId, status, driverId, driver: { driverId, latitude,
 *           longitude, accuracy, speed, heading, capturedAt } | null,
 *           destination: { latitude, longitude, capturedAt } | null }
 *       403:
 *         description: Ni client, ni livreur, ni boutique de la commande
 *       404:
 *         description: Commande introuvable
 */
router.get('/tracking/:orderId', firebaseAuth, getOrderTrackingController);

/**
 * @swagger
 * /driver/applications/{fastFoodId}:
 *   get:
 *     summary: Lister les candidatures reçues par un fastFood
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des candidatures (avec infos candidat)
 */
router.get('/applications/:fastFoodId', firebaseAuth, authorize(fastfoodFromParam), getApplicationsController);

/**
 * @swagger
 * /driver/list/{fastFoodId}:
 *   get:
 *     summary: Lister les livreurs assignés à un fastFood
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des livreurs (DriverInfo[])
 */
router.get('/list/:fastFoodId', firebaseAuth, authorize(fastfoodFromParam), getDriversController);

/**
 * @swagger
 * /driver/stores/{driverId}:
 *   get:
 *     summary: Lister les boutiques servies par un livreur (filtre « Mes livraisons »)
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *         description: uid du livreur
 *     responses:
 *       200:
 *         description: Liste de StoreOption { id, nom }
 */
router.get('/stores/:driverId', firebaseAuth, authorize(selfFromParam('driverId')), getStoresController);

/**
 * @swagger
 * /driver/my-applications/{userId}:
 *   get:
 *     summary: Lister les demandes envoyées par un user (« Mes demandes »)
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: DriverApplication[] avec fastFoodName + status
 */
router.get('/my-applications/:userId', firebaseAuth, authorize(selfFromParam('userId')), getMyApplicationsController);

/**
 * @swagger
 * /driver/applications/{applicationId}:
 *   put:
 *     summary: Accepter ou refuser une candidature livreur
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decision
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [accepted, refused]
 *     responses:
 *       200:
 *         description: Décision appliquée (accepted pose user.driverId)
 *       400:
 *         description: Décision invalide
 *       404:
 *         description: Demande non trouvée
 *       409:
 *         description: Demande déjà traitée
 */
router.put('/applications/:applicationId', firebaseAuth, authorize(driverApplicationFromParam), decide);

/**
 * @swagger
 * /driver/{driverId}:
 *   delete:
 *     summary: Retirer un livreur d'une boutique
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *         description: uid du livreur
 *       - in: query
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: Boutique dont on retire le livreur
 *     responses:
 *       200:
 *         description: Livreur retiré (user.driverId vidé s'il ne sert plus aucune boutique)
 *       400:
 *         description: driverId ou fastFoodId manquant
 */
router.delete('/:driverId', firebaseAuth, authorize(driverRemove), removeDriverController);

/**
 * @swagger
 * /driver/{driverId}/rating:
 *   post:
 *     summary: Noter un livreur (client livré par ce livreur)
 *     description: Le user fournit l'orderId d'une commande livrée (delivered) lui appartenant et dont order.driverId = ce livreur. Une note par (user, livreur) — re-noter met à jour. Émet `driverRatingUpdated` au livreur, au user et au marchand.
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, value]
 *             properties:
 *               orderId: { type: string }
 *               value: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       200: { description: Livreur noté (renvoie rating + ratingAvg + ratingCount) }
 *       400: { description: Données invalides }
 *       403: { description: Commande non livrée, pas au user, ou pas livrée par ce livreur }
 *       404: { description: Commande non trouvée }
 */
router.post('/:driverId/rating', firebaseAuth, rateDriverController);

/**
 * @swagger
 * /driver/{driverId}/ratings:
 *   get:
 *     summary: Liste des avis d'un livreur
 *     tags: [Ratings]
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Liste des avis du livreur }
 */
router.get('/:driverId/ratings', firebaseAuth, getDriverRatingsController);

/**
 * @swagger
 * /driver/{driverId}:
 *   get:
 *     summary: Infos d'un livreur (contenu adapté au demandeur)
 *     description: >
 *       Renvoie un profil livreur dont le détail dépend de l'appelant (token) :
 *       simple user → profil public (nom/prénom, fallback email, photo, note, boutiques) ;
 *       marchand possédant ce livreur → + stats commandes POUR SA boutique (livrées, en cours, en attente) ;
 *       le livreur lui-même → + stats GLOBALES (toutes boutiques). `scope` indique la vue servie.
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Profil livreur (champ `scope` = public | merchant | self)
 *       404: { description: Livreur non trouvé ou utilisateur non livreur }
 */
router.get('/:driverId', firebaseAuth, getDriverProfileController);

module.exports = router;
