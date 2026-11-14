const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const { getCurrentLegal, getLegalStatus, acceptLegal } = require('../controllers/legal/legal.controller');

/**
 * @swagger
 * /legal/current:
 *   get:
 *     summary: Texte en vigueur des conditions d'utilisation et de la politique de confidentialité
 *     tags: [Legal]
 *     responses:
 *       200: { description: "{ version, title, content, requiresAcceptance, publishedAt }" }
 */
router.get('/current', getCurrentLegal);

/**
 * @swagger
 * /legal/status:
 *   get:
 *     summary: Statut d'acceptation de l'utilisateur authentifié
 *     tags: [Legal]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ latestVersion, publishedAt, acceptedVersion, acceptedAt, mustAccept }" }
 */
router.get('/status', firebaseAuth, getLegalStatus);

/**
 * @swagger
 * /legal/accept:
 *   post:
 *     summary: Enregistre l'acceptation de la version en vigueur (preuve, idempotent)
 *     tags: [Legal]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { version: { type: integer } }, required: [version] }
 *     responses:
 *       200: { description: Statut à jour }
 *       409: { description: "legal_outdated : la version envoyée n'est plus la dernière" }
 */
router.post('/accept', firebaseAuth, acceptLegal);

module.exports = router;
