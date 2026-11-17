const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const { getCurrentLegal, getLegalStatus, acceptLegal, saveMerchantAdhesion } = require('../controllers/legal/legal.controller');

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

/**
 * @swagger
 * /legal/merchant-adhesion:
 *   post:
 *     summary: Formulaire d'adhésion du Marchand (Annexe 3), enregistré à la création de la boutique
 *     tags: [Legal]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fastFoodId, version, representativeRole]
 *             properties:
 *               fastFoodId: { type: string }
 *               version: { type: integer }
 *               representativeRole: { type: string, description: "texte libre (suggestions : gerant, directeur, proprietaire)" }
 *               legalName: { type: string, description: "Dénomination légale, facultative" }
 *               address: { type: string, description: "facultatif : position GPS de la boutique sinon ses villes" }
 *     responses:
 *       200: { description: Enregistré (vaut aussi acceptation des CGU) }
 *       400: { description: Qualité ou adresse manquante }
 *       403: { description: Boutique d'un autre compte }
 *       409: { description: legal_outdated }
 */
router.post('/merchant-adhesion', firebaseAuth, saveMerchantAdhesion);

module.exports = router;
