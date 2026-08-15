// src/routes/bannersRoutes.js
const express = require('express');
const upload = require('../config/multer');
const firebaseAuth = require('../middlewares/authMiddleware');
const adminGuard = require('../middlewares/adminMiddleware');
const {
  getActiveBannersController,
  getAllBannersController,
  createBannerController,
  updateBannerController,
  deleteBannerController,
} = require('../controllers/banners/banners.controller');

const route = express.Router();

route.get('/', getActiveBannersController);

/**
 * @swagger
 * /banner/all:
 *   get:
 *     summary: Liste toutes les bannières (admin)
 *     description: >-
 *       Bannières publicitaires du carrousel home, y compris inactives, pour
 *       l'écran d'administration. Triées par ordre d'affichage.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des bannières
 *       401: { description: Non authentifié }
 *       403: { description: Réservé aux administrateurs }
 */
route.get('/all', firebaseAuth, adminGuard, getAllBannersController);

/**
 * @swagger
 * /banner:
 *   post:
 *     summary: Crée une bannière (admin)
 *     description: >-
 *       `sortOrder` optionnel : la position dans le carrousel. Si le numéro est
 *       déjà pris (ou au-delà), les bannières suivantes sont décalées
 *       automatiquement pour garder une séquence continue 0..n-1.
 *       `type` = 'bonus' (ouvre la sheet bonus, `targetId` requis) ou 'none'.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl, type]
 *             properties:
 *               title: { type: string }
 *               imageUrl: { type: string }
 *               type: { type: string, enum: [bonus, none] }
 *               targetId: { type: string, nullable: true }
 *               active: { type: boolean }
 *               sortOrder: { type: integer }
 *     responses:
 *       201: { description: Bannière créée }
 *       400: { description: Payload invalide }
 *       401: { description: Non authentifié }
 *       403: { description: Réservé aux administrateurs }
 */
route.post('/', upload.single('image'), firebaseAuth, adminGuard, createBannerController);

/**
 * @swagger
 * /banner/{id}:
 *   patch:
 *     summary: Modifie / déplace une bannière (admin)
 *     description: >-
 *       Tous les champs sont optionnels. Fournir `sortOrder` déplace la
 *       bannière à cette position, avec réordonnancement automatique des suivants.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               imageUrl: { type: string }
 *               type: { type: string, enum: [bonus, none] }
 *               targetId: { type: string, nullable: true }
 *               active: { type: boolean }
 *               sortOrder: { type: integer }
 *     responses:
 *       200: { description: Bannière mise à jour }
 *       400: { description: Payload invalide }
 *       401: { description: Non authentifié }
 *       403: { description: Réservé aux administrateurs }
 *       404: { description: Bannière introuvable }
 */
route.patch('/:id', upload.single('image'), firebaseAuth, adminGuard, updateBannerController);

/**
 * @swagger
 * /banner/{id}:
 *   delete:
 *     summary: Supprime une bannière (admin)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Bannière supprimée }
 *       401: { description: Non authentifié }
 *       403: { description: Réservé aux administrateurs }
 */
route.delete('/:id', firebaseAuth, adminGuard, deleteBannerController);

module.exports = route;
