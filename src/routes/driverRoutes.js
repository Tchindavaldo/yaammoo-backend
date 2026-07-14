const express = require('express');
const {
  apply,
  getApplicationsController,
  getDriversController,
  getStoresController,
  getMyApplicationsController,
  removeDriverController,
  decide,
} = require('../controllers/driver/driverController');

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
router.post('/apply', apply);

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
router.get('/applications/:fastFoodId', getApplicationsController);

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
router.get('/list/:fastFoodId', getDriversController);

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
router.get('/stores/:driverId', getStoresController);

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
router.get('/my-applications/:userId', getMyApplicationsController);

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
router.put('/applications/:applicationId', decide);

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
router.delete('/:driverId', removeDriverController);

module.exports = router;
