// src/routes/settingsRoutes.js
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { getPublicPricingController, getSettingsController, patchSettingController } = require('../controllers/settings/settings.controller');

const route = express.Router();

/**
 * @swagger
 * /settings/pricing:
 *   get:
 *     summary: Réglages tarifaires publics
 *     description: >-
 *       Vue restreinte, destinée au front client. **La marge plateforme n'y
 *       figure pas** : elle est fondue dans les prix affichés, l'exposer
 *       reviendrait à révéler au client ce qui est pris sur chaque commande.
 *     tags:
 *       - Settings
 *     responses:
 *       200:
 *         description: Réglages tarifaires
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentFeePercent:
 *                       type: number
 *                       description: Frais prestataire de paiement, en % du montant payé, arrondi à l'entier supérieur.
 *                     deliveryFreeMode:
 *                       type: boolean
 *                       description: Campagne « livraison offerte » globale en cours.
 */
route.get('/pricing', getPublicPricingController);

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Tous les réglages métier (admin)
 *     description: >-
 *       Réglages modifiables **à chaud**, stockés en base (table `settings`) et
 *       non dans `.env` : ce sont des décisions commerciales qu'on doit pouvoir
 *       basculer sans redéployer.
 *     tags:
 *       - Settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des réglages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key: { type: string }
 *                       value: {}
 *                       description: { type: string }
 *                       updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Token manquant ou invalide
 *       403:
 *         description: Réservé aux administrateurs
 */
route.get('', firebaseAuth, getSettingsController);

/**
 * @swagger
 * /settings/{key}:
 *   patch:
 *     summary: Modifie un réglage (admin)
 *     description: >-
 *       Prise en compte immédiate, au plus après expiration du cache mémoire
 *       (`SETTINGS_CACHE_TTL_MS`). Le cache de la machine qui écrit est purgé
 *       aussitôt ; les autres machines suivent à l'expiration.
 *     tags:
 *       - Settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           enum: [platform_margin, payment_fee_percent, delivery_free_mode]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value:
 *                 description: >-
 *                   Booléen pour `delivery_free_mode`, nombre positif pour les
 *                   autres. Un mauvais type fausserait silencieusement les calculs
 *                   de prix, il est donc refusé.
 *     responses:
 *       200:
 *         description: Réglage mis à jour
 *       400:
 *         description: Clé inconnue, `value` manquante ou mal typée
 *       401:
 *         description: Token manquant ou invalide
 *       403:
 *         description: Réservé aux administrateurs
 */
route.patch('/:key', firebaseAuth, patchSettingController);

module.exports = route;
