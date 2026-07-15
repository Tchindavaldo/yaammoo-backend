const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { postMenuController } = require('../controllers/menu/postMenu.controller');
const { getMenuController } = require('../controllers/menu/getMenu.controller');
const { deleteMenuController } = require('../controllers/menu/deleteMenu.controller');
const { updateMenuController } = require('../controllers/menu/updateMenu.controller');
const { rateMenuController, getMenuRatingsController } = require('../controllers/rating/rateMenu.controller');
const { getMenuStatsController } = require('../controllers/rating/getMenuStats.controller');

const router = express.Router();

/**
 * @swagger
 * /menu:
 *   post:
 *     summary: Create a new menu item
 *     tags:
 *       - Menus
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fastFoodId
 *               - name
 *               - price
 *               - extra
 *               - drink
 *             properties:
 *               fastFoodId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               image:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *     responses:
 *       201:
 *         description: Menu item successfully created
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
 *                   $ref: '#/components/schemas/Menu'
 *       400:
 *         description: Invalid input
 */
router.post('', postMenuController);

/**
 * @swagger
 * /menu/{fastFoodId}:
 *   get:
 *     summary: Get all menus for a fastfood
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: List of menus
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
 *                     $ref: '#/components/schemas/Menu'
 *       404:
 *         description: FastFood not found
 */
router.get('/:fastFoodId', getMenuController);

/**
 * @swagger
 * /menu/{menuId}:
 *   delete:
 *     summary: Delete a menu item
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *     responses:
 *       200:
 *         description: Menu item successfully deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Menu item not found
 */
router.delete('/:menuId', deleteMenuController);

/**
 * @swagger
 * /menu/{menuId}:
 *   put:
 *     summary: Update a menu item
 *     tags:
 *       - Menus
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               image:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               extra:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *               drink:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     status:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Menu item successfully updated
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
 *                   $ref: '#/components/schemas/Menu'
 *       404:
 *         description: Menu item not found
 *       400:
 *         description: Invalid input
 */
router.put('/:menuId', updateMenuController);

/**
 * @swagger
 * /menu/{menuId}/rating:
 *   post:
 *     summary: Noter un plat (client ayant reçu ce plat)
 *     description: Le user doit fournir l'orderId d'une commande livrée (delivered) lui appartenant et contenant ce plat. Une note par (user, plat) — re-noter met à jour. Émet `menuRatingUpdated` au marchand et au user.
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuId
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
 *       200: { description: Plat noté (renvoie rating + ratingAvg + ratingCount) }
 *       400: { description: Données invalides }
 *       403: { description: Commande non livrée, pas au user, ou ne contient pas ce plat }
 *       404: { description: Commande non trouvée }
 */
router.post('/:menuId/rating', firebaseAuth, rateMenuController);

/**
 * @swagger
 * /menu/{menuId}/ratings:
 *   get:
 *     summary: Liste des avis d'un plat
 *     tags: [Ratings]
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Liste des avis (value, comment, userId, createdAt) }
 */
router.get('/:menuId/ratings', getMenuRatingsController);

/**
 * @swagger
 * /menu/{menuId}/stats:
 *   get:
 *     summary: Stats de commande d'un plat, adaptées au demandeur (self | client)
 *     description: >
 *       Retourne les statistiques de commande d'un plat, calculées à la volée
 *       (aucun compteur stocké). La forme de la réponse dépend de qui appelle :
 *         • **self** (marchand propriétaire du plat) → `stats` GLOBALES : combien de
 *           fois CE plat a été commandé/livré par TOUS les users.
 *         • **client** (user ayant déjà commandé ce plat) → `myStats` (SES commandes
 *           de ce plat) + `hasRated` / `canRate`.
 *       Accès refusé (403) si l'appelant n'est ni le propriétaire ni un client du plat.
 *       Le plat porte toujours `ratingAvg` / `ratingCount`.
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema: { type: string }
 *         description: ID du plat
 *     responses:
 *       200:
 *         description: Stats trouvées (forme selon `scope`)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 scope: { type: string, enum: [self, client] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     menuId: { type: string }
 *                     fastFoodId: { type: string, nullable: true }
 *                     name: { type: string, nullable: true }
 *                     image: { type: string, nullable: true }
 *                     ratingAvg: { type: number }
 *                     ratingCount: { type: integer }
 *                     totalOrders:
 *                       type: integer
 *                       description: Total commandes reçues par le plat (tous users), hors annulations, depuis sa création. Présent en scope=self ET scope=client.
 *                     stats:
 *                       type: object
 *                       description: Ventilation par statut du total. Présent uniquement si scope=self.
 *                       properties:
 *                         delivered: { type: integer }
 *                         inProgress: { type: integer }
 *                         pending: { type: integer }
 *                     myTotalOrders:
 *                       type: integer
 *                       description: Total commandes de l'appelant sur ce plat (hors annulations). Présent uniquement si scope=client.
 *                     hasRated: { type: boolean, description: scope=client uniquement }
 *                     canRate: { type: boolean, description: scope=client uniquement }
 *       401: { description: Non authentifié }
 *       403: { description: Ni propriétaire du plat ni client de ce plat }
 *       404: { description: Plat non trouvé }
 */
router.get('/:menuId/stats', firebaseAuth, getMenuStatsController);

module.exports = router;
