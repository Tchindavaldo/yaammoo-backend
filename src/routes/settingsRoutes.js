// src/routes/settingsRoutes.js
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { getPublicPricingController, getAppVersionGateController, getSettingsController, patchSettingController } = require('../controllers/settings/settings.controller');

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
 * /settings/app-version:
 *   get:
 *     summary: État de version pour le client courant
 *     description: >-
 *       Public. Compare la version du client (header `x-app-version`) à
 *       `platform_min_app_version` et `platform_latest_app_version`. `forceUpdate` = le client
 *       est sous le minimum, l'app doit bloquer l'accès. `updateAvailable` =
 *       une version plus récente existe, mise à jour non bloquante.
 *     tags:
 *       - Settings
 *     responses:
 *       200:
 *         description: État de version
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
 *                     clientVersion: { type: string }
 *                     minVersion: { type: string }
 *                     latestVersion: { type: string }
 *                     forceUpdate: { type: boolean }
 *                     updateAvailable: { type: boolean }
 */
route.get('/app-version', getAppVersionGateController);

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Tous les réglages métier, groupés par catégorie (admin)
 *     description: >-
 *       Réglages modifiables **à chaud**, stockés en base et non dans `.env` :
 *       ce sont des décisions commerciales qu'on doit pouvoir basculer sans
 *       redéployer. Depuis la migration 046 ils sont répartis en cinq tables
 *       `settings_<categorie>` — `auth`, `pricing`, `delivery`, `withdrawal`,
 *       `deployment` — et la réponse est groupée par catégorie.
 *       Les SECRETS n'y figurent pas (la clé d'API Bird reste en variable
 *       d'environnement).
 *     tags:
 *       - Settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Réglages groupés par catégorie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   description: Une entrée par catégorie (auth, pricing, delivery, withdrawal, deployment).
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         key: { type: string }
 *                         value: {}
 *                         description: { type: string }
 *                         updatedAt: { type: string, format: date-time }
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
 *       La table écrite est déduite de la catégorie de la clé — l'appelant n'a
 *       pas à la connaître.
 *     tags:
 *       - Settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         description: >-
 *           Clé du réglage. La catégorie (donc la table `settings_<categorie>`)
 *           est déduite côté serveur.
 *         schema:
 *           type: string
 *           enum:
 *             # auth (settings_auth)
 *             - otp_resend_cooldown_seconds
 *             - otp_expires_in_seconds
 *             - otp_default_country_code
 *             - otp_bird_timeout_ms
 *             # pricing (settings_pricing)
 *             - platform_margin
 *             - payment_fee_percent
 *             - price_rounding_step
 *             - express_price_rounding_step
 *             - driver_amortization_max
 *             - fastfood_margin
 *             - fastfood_margin_tier_2_min_brut
 *             - fastfood_margin_tier_2_margin
 *             - fastfood_min_covered_course
 *             # delivery (settings_delivery)
 *             - delivery_free_mode
 *             - platform_free_delivery_min_items_bonus
 *             - platform_free_delivery_min_items_campaign
 *             # withdrawal (settings_withdrawal)
 *             - withdrawal_fee_mtn_threshold
 *             - withdrawal_fee_mtn_flat
 *             - withdrawal_fee_mtn_percent
 *             - withdrawal_fee_mtn_addend
 *             - withdrawal_fee_orange_threshold
 *             - withdrawal_fee_orange_flat
 *             - withdrawal_fee_orange_percent
 *             - withdrawal_fee_orange_addend
 *             # deployment (settings_deployment)
 *             - platform_min_app_version
 *             - platform_latest_app_version
 *             - apple_review_mode
 *             - apple_version_review_mode
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
 *                   Type attendu selon la clé. Booléen pour `delivery_free_mode`
 *                   et `apple_review_mode` ; version `"x.y.z"` pour
 *                   `platform_min_app_version` et `platform_latest_app_version` ;
 *                   chaîne libre (vide autorisée) pour `apple_version_review_mode` ;
 *                   chaîne de chiffres pour `otp_default_country_code` (ex. `"237"`) ;
 *                   nombre positif pour toutes les autres. Un mauvais type
 *                   fausserait silencieusement les calculs de prix, il est donc refusé.
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
