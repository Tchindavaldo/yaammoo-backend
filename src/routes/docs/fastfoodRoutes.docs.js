// ============================================================================
// Doc Swagger de `GET` / `POST /fastFood/{fastFoodId}` (routes dans
// fastfoodRoutes.js). Sortie du fichier de routes, qui dépassait le plafond R3 ;
// aucun code ici, lu seulement par swagger-jsdoc (config/swagger.js).
// ============================================================================

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
 *               openDays:
 *                 type: array
 *                 description: Jours d'ouverture, 0 (dimanche) à 6 (samedi). [] = indisponible.
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3, 4, 5, 6]
 *               isAvailable:
 *                 type: boolean
 *                 description: Coupure manuelle (false = indisponible, openDays conservé).
 *               latitude:
 *                 type: number
 *                 nullable: true
 *                 description: Position de la boutique (migration 060), avec `longitude`. `null` + `null` = effacer.
 *               longitude:
 *                 type: number
 *                 nullable: true
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
 *       400:
 *         description: Champ invalide (ex. latitude sans longitude)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Cette boutique ne vous appartient pas
 *       404:
 *         description: Boutique introuvable
 */
