// src/routes/fastfoodRoutes.js
const express = require('express');
const { createFastfoodController } = require('../controllers/fastfood/createFastfood');
const { getfastfoodController } = require('../controllers/fastfood/getFastFoods');
const { getfastfood } = require('../controllers/fastfood/getFastFood');
const { updateFastfoodController } = require('../controllers/fastfood/updateFastfood');
const { searchFastfoodController } = require('../controllers/fastfood/searchFastfood');
const { getFastFoodDeliveryStatsController } = require('../controllers/fastfood/getFastFoodDeliveryStats');
const { patchFastFoodDeliveryController, patchAllFastFoodsDeliveryController } = require('../controllers/fastfood/deliveryConfig.controller');
const { deleteFastfoodsController, restoreFastfoodController, listDeletedFastfoodsController, purgeDeletedFastfoodsController } = require('../controllers/fastfood/deleteFastfood.controller');
const firebaseAuth = require('../middlewares/authMiddleware');
const adminGuard = require('../middlewares/adminMiddleware');
const fastfoodOwnerGuard = require('../middlewares/fastfoodOwnerMiddleware');
const optionalFirebaseAuth = require('../middlewares/optionalAuthMiddleware');

const route = express.Router();

/**
 * @swagger
 * /fastFood:
 *   post:
 *     summary: Create a new fastfood restaurant
 *     tags:
 *       - FastFood
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - userId
 *             properties:
 *               name:
 *                 type: string
 *               userId:
 *                 type: string
 *               number:
 *                 type: string
 *               momoNumber:
 *                 type: string
 *               whatsappNumber:
 *                 type: string
 *               openTime:
 *                 type: string
 *               closeTime:
 *                 type: string
 *               image:
 *                 type: string
 *               orderLeadTime:
 *                 type: number
 *               advanceDays:
 *                 type: number
 *               pickupAllowed:
 *                 type: boolean
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *               deliveryHours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     hour:
 *                       type: string
 *                     periodic:
 *                       type: boolean
 *                     periodicZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *                     express:
 *                       type: boolean
 *                     expressZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *     responses:
 *       201:
 *         description: FastFood successfully created
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
 *                   $ref: '#/components/schemas/FastFood'
 *       400:
 *         description: Invalid input
 */
route.post('', createFastfoodController);

/**
 * @swagger
 * /fastFood/all:
 *   get:
 *     summary: Liste les boutiques (avec leurs menus)
 *     description: >-
 *       Route **publique à authentification facultative**. Sans token, la réponse
 *       est celle d'avant. Avec un token valide, chaque boutique porte en plus
 *       `deliveryOffer` : l'offre de livraison armée par CE user et applicable
 *       ici (bonus de la boutique, ou bonus plateforme valable partout).
 *
 *       Seules les boutiques ayant au moins un menu sont renvoyées.
 *     tags:
 *       - FastFood
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     responses:
 *       200:
 *         description: Liste des boutiques
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 appleReviewMode:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/FastFood'
 *                       - type: object
 *                         properties:
 *                           menus:
 *                             type: array
 *                             items:
 *                               $ref: '#/components/schemas/Menu'
 *                           deliveryOffer:
 *                             $ref: '#/components/schemas/DeliveryOffer'
 */
route.get('/all', optionalFirebaseAuth, getfastfoodController);

/**
 * @swagger
 * /fastFood/{fastFoodId}:
 *   get:
 *     summary: Get a specific fastfood restaurant by ID
 *     tags:
 *       - FastFood
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FastFood details
 *   post:
 *     summary: Update a fastfood restaurant (propriétaire ou admin)
 *     description: >-
 *       Réservé au **propriétaire** de la boutique, ou à un **admin plateforme**
 *       (qui peut modifier n'importe quelle boutique). Auparavant publique.
 *     tags:
 *       - FastFood
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               number:
 *                 type: string
 *               momoNumber:
 *                 type: string
 *               whatsappNumber:
 *                 type: string
 *               openTime:
 *                 type: string
 *               closeTime:
 *                 type: string
 *               image:
 *                 type: string
 *               orderLeadTime:
 *                 type: number
 *               advanceDays:
 *                 type: number
 *               pickupAllowed:
 *                 type: boolean
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *               deliveryHours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     hour:
 *                       type: string
 *                     periodic:
 *                       type: boolean
 *                     periodicZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *                     express:
 *                       type: boolean
 *                     expressZones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lieu:
 *                             type: string
 *                           prix:
 *                             type: string
 *     responses:
 *       200:
 *         description: FastFood successfully updated
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Cette boutique ne vous appartient pas
 *       404:
 *         description: Boutique introuvable
 */
/**
 * @swagger
 * /fastFood/search:
 *   get:
 *     summary: Rechercher une boutique par nom (option « Devenir livreur »)
 *     tags:
 *       - FastFood
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Terme de recherche (nom de boutique)
 *     responses:
 *       200:
 *         description: Liste de StoreOption { id, nom }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nom:
 *                         type: string
 */
route.get('/search', searchFastfoodController);

/**
 * @swagger
 * /fastFood/{fastFoodId}/delivery-stats:
 *   get:
 *     summary: Stats de livraison du fastFood (auto-livraison), adaptées au demandeur
 *     description: >
 *       Le fastFood peut livrer lui-même (order.driverId = fastFoodId). Renvoie des stats
 *       dont le détail dépend de l'appelant (token) : le marchand propriétaire → stats GLOBALES
 *       de ses auto-livraisons (`scope: self`) ; un client de la boutique → SES stats avec
 *       cette boutique + `hasRated`/`canRate` (`scope: client`). Tout autre demandeur → 403.
 *     tags: [FastFood]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stats livraison (champ `scope` = self | client)
 *       401: { description: Non authentifié }
 *       403: { description: Ni propriétaire ni client de la boutique }
 *       404: { description: FastFood non trouvé }
 */
/**
 * @swagger
 * /fastFood/delivery:
 *   patch:
 *     tags: [FastFood]
 *     summary: Configure la livraison de TOUTES les boutiques (admin)
 *     description: >-
 *       Amorce un parc entier sans toucher les boutiques une par une. Chaque
 *       boutique est validee separement : celles qui ne peuvent pas basculer
 *       sont listees dans `skipped` plutot que de faire echouer tout le lot.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliveryBy: { type: string, enum: [fastfood, platform] }
 *               platformDeliveryZones:
 *                 type: array
 *                 description: Meme forme que `deliveryHours` (periodicZones / expressZones par creneau).
 *                 items: { type: object }
 *     responses:
 *       200: { description: Bilan des mises a jour (updated / skipped) }
 *       403: { description: Reserve aux administrateurs }
 */
route.patch('/delivery', firebaseAuth, adminGuard, patchAllFastFoodsDeliveryController);

/**
 * @swagger
 * /fastFood/{fastFoodId}/delivery:
 *   patch:
 *     tags: [FastFood]
 *     summary: Configure la livraison d'une boutique (admin)
 *     description: >-
 *       `deliveryBy` decide de la repartition de l'argent : en regime `platform`
 *       la course quitte le fastfood pour aller au livreur, et le prix affiche
 *       est cale sur un multiple du pas d'arrondi. Decision commerciale, jamais
 *       celle du marchand. La bascule est REFUSEE si la boutique n'a aucune zone
 *       plateforme — le supplement livraison tomberait a 0 et le livreur ne
 *       serait pas paye.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliveryBy: { type: string, enum: [fastfood, platform] }
 *               platformDeliveryZones:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200: { description: Boutique mise a jour }
 *       400: { description: Regime platform sans zones, ou payload invalide }
 *       403: { description: Reserve aux administrateurs }
 *       404: { description: Boutique introuvable }
 */
route.patch('/:fastFoodId/delivery', firebaseAuth, adminGuard, patchFastFoodDeliveryController);

route.get('/:fastFoodId/delivery-stats', firebaseAuth, getFastFoodDeliveryStatsController);

// ============================================================================
// Suppression ADMIN de boutiques (soft delete, restaurable)
// ----------------------------------------------------------------------------
// ⚠️ Ces routes DOIVENT rester déclarées avant `/:fastFoodId` : Express prend la
// première qui matche, et `/admin/deleted` serait sinon capté comme un id de
// boutique nommé « admin ».
// ============================================================================

/**
 * @swagger
 * /fastFood/admin:
 *   delete:
 *     tags: [FastFood]
 *     summary: Supprime une ou plusieurs boutiques (admin, soft delete)
 *     description: >-
 *       Marque les boutiques et les données choisies comme supprimées. Rien
 *       n'est effacé physiquement avant `FASTFOOD_DELETE_RETENTION_DAYS` jours :
 *       `POST /fastFood/admin/{fastFoodId}/restore` annule jusque-là.
 *
 *       **`scopes` est obligatoire** — aucune suppression « tout » implicite.
 *       Passer `"all"` (chaîne) pour tout emporter, ou la liste voulue parmi
 *       `menus`, `orders`, `notifications`, `bonus`, `drivers`, `support`,
 *       `deliveries`.
 *
 *       ⚠️ Les données FINANCIÈRES (`withdrawals`, `order_settlements`,
 *       `platform_revenues`, `transactions`) ne sont jamais supprimables :
 *       les demander explicitement renvoie 400.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fastFoodIds, scopes]
 *             properties:
 *               fastFoodIds:
 *                 type: array
 *                 items: { type: string }
 *               scopes:
 *                 oneOf:
 *                   - type: string
 *                     enum: [all]
 *                   - type: array
 *                     items:
 *                       type: string
 *                       enum: [menus, orders, notifications, bonus, drivers, support, deliveries]
 *     responses:
 *       200: { description: Toutes les boutiques demandées ont été supprimées }
 *       207: { description: Lot partiellement appliqué (voir `skipped`) }
 *       400: { description: scopes manquant/invalide, scope financier, ou liste vide }
 *       403: { description: Réservé aux administrateurs }
 */
route.delete('/admin', firebaseAuth, adminGuard, deleteFastfoodsController);

/**
 * @swagger
 * /fastFood/admin/deleted:
 *   get:
 *     tags: [FastFood]
 *     summary: Boutiques en corbeille (admin)
 *     description: Chaque entrée porte `deletedAt` et `daysUntilPurge`.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Liste des boutiques supprimées non encore purgées }
 *       403: { description: Réservé aux administrateurs }
 */
route.get('/admin/deleted', firebaseAuth, adminGuard, listDeletedFastfoodsController);

/**
 * @swagger
 * /fastFood/admin/purge:
 *   post:
 *     tags: [FastFood]
 *     summary: Efface définitivement les boutiques expirées (admin)
 *     description: >-
 *       Normalement déclenchée par le job planifié. Supprime les lignes ET les
 *       images du bucket. Irréversible.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionDays:
 *                 type: integer
 *                 description: Surcharge ponctuelle du délai de rétention.
 *     responses:
 *       200: { description: Bilan de la purge (purged, ids, imagesDeleted, imageErrors) }
 *       403: { description: Réservé aux administrateurs }
 */
route.post('/admin/purge', firebaseAuth, adminGuard, purgeDeletedFastfoodsController);

/**
 * @swagger
 * /fastFood/admin/{fastFoodId}/restore:
 *   post:
 *     tags: [FastFood]
 *     summary: Annule la suppression d'une boutique (admin)
 *     description: >-
 *       Possible tant que la purge n'est pas passée. Ne restaure que les lignes
 *       marquées au même instant que la boutique. ⚠️ `users.fastFoodId` n'est
 *       PAS réattribué automatiquement (le propriétaire a pu créer une autre
 *       boutique entre-temps).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Boutique restaurée }
 *       400: { description: Boutique non supprimée ou déjà purgée }
 *       403: { description: Réservé aux administrateurs }
 */
route.post('/admin/:fastFoodId/restore', firebaseAuth, adminGuard, restoreFastfoodController);

route.get('/:fastFoodId', getfastfood);

// ⚠️ Cette route était PUBLIQUE : n'importe qui, sans être connecté, pouvait
// renommer une boutique ou changer son numéro Mobile Money. Désormais réservée
// au propriétaire — ou à un admin plateforme, qui doit pouvoir corriger
// n'importe quelle boutique.
route.post('/:fastFoodId', firebaseAuth, fastfoodOwnerGuard, updateFastfoodController);

module.exports = route;
