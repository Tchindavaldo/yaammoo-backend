// src/routes/userRoutes.js
const express = require('express');
const { getUsers, getOneUserByIdController, createUser, updateUser, getUserByEmail, getUserByPhone, addPushToken, removePushToken, deleteOwnAccount } = require('../controllers/user/userController');
const firebaseAuth = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /user/delete-account:
 *   delete:
 *     summary: Supprimer définitivement son propre compte (RGPD / Apple 5.1.1(v))
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compte supprimé
 *       401:
 *         description: Non authentifié
 */
router.delete('/delete-account', firebaseAuth, deleteOwnAccount);

/**
 * @swagger
 * /user:
 *   get:
 *     summary: Get all users
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: List of all users
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
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Error retrieving users
 */
router.get('', getUsers);

/**
 * @swagger
 * /user/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
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
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', getOneUserByIdController);

/**
 * @swagger
 * /user:
 *   post:
 *     summary: Create a new user (protected)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, fastfood_owner, admin]
 *     responses:
 *       201:
 *         description: User successfully created
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
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('', firebaseAuth, createUser);

/**
 * @swagger
 * /user/{id}:
 *   put:
 *     summary: Update a user
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: User successfully updated
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
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       400:
 *         description: Invalid input
 */
router.put('/:id', updateUser);

/**
 * @swagger
 * /user/push-token/add:
 *   post:
 *     summary: Enregistrer un push token (FCM/Expo) pour l'utilisateur connecté
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Push token FCM ou Expo
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *               deviceId:
 *                 type: string
 *                 description: Identifiant unique de l'appareil
 *     responses:
 *       200:
 *         description: Token enregistré
 *       401:
 *         description: Non authentifié
 */
router.post('/push-token/add', firebaseAuth, addPushToken);

/**
 * @swagger
 * /user/push-token/remove:
 *   post:
 *     summary: Supprimer un push token (déconnexion / changement d'appareil)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *             properties:
 *               deviceId:
 *                 type: string
 *                 description: Identifiant de l'appareil dont supprimer le token
 *     responses:
 *       200:
 *         description: Token supprimé
 *       401:
 *         description: Non authentifié
 */
router.post('/push-token/remove', firebaseAuth, removePushToken);

/**
 * @swagger
 * /user/email/{email}:
 *   get:
 *     summary: Rechercher un utilisateur par email
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: Utilisateur trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Utilisateur non trouvé
 */
router.get('/email/:email', getUserByEmail);

/**
 * @swagger
 * /user/phone/{phone}:
 *   get:
 *     summary: Rechercher un utilisateur par numéro de téléphone
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Utilisateur trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Utilisateur non trouvé
 */
router.get('/phone/:phone', getUserByPhone);

module.exports = router;
