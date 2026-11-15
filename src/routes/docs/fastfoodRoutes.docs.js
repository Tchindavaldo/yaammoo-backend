// ============================================================================
// Doc Swagger de `GET` / `POST /fastFood/{fastFoodId}` et des routes admin de la boutique
// WhatsApp (`whatsapp-orders`, `payout-number`) (routes dans
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
 *               expressZones:
 *                 type: array
 *                 description: Zones EXPRESS de la boutique, SANS heure (migration 073). Un prix par lieu.
 *                 items:
 *                   type: object
 *                   properties:
 *                     lieu:
 *                       type: string
 *                     prix:
 *                       type: string
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

// --- POST /fastFood (création), sorti de fastfoodRoutes.js ---
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
 *               openDays:
 *                 type: array
 *                 description: Jours d'ouverture, 0 (dimanche) à 6 (samedi). [] = indisponible.
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3, 4, 5, 6]
 *               isAvailable:
 *                 type: boolean
 *                 description: Coupure manuelle (false = indisponible, openDays conservé).
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
 *               expressZones:
 *                 type: array
 *                 description: Zones EXPRESS de la boutique, SANS heure (migration 073). Un prix par lieu.
 *                 items:
 *                   type: object
 *                   properties:
 *                     lieu:
 *                       type: string
 *                     prix:
 *                       type: string
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

/**
 * @swagger
 * /fastfood/{fastFoodId}/whatsapp-orders:
 *   patch:
 *     summary: Boutique WhatsApp (admin) - commandes envoyees au marchand sur WhatsApp
 *     description: |
 *       Pour un marchand sans l'app. Les commandes payees lui arrivent sur le numero
 *       `whatsappNumber` de la boutique (template yam_nouvelle_commande, boutons Accepter / Refuser),
 *       puis le suivi des statuts se fait par boutons. Activer exige un whatsappNumber valide.
 *     tags: [FastFood]
 *     security:
 *       - bearerAuth: []
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
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200: { description: "{ success, message, fastFood: { id, whatsappOrders, whatsappNumber } }" }
 *       400: { description: enabled manquant, ou boutique sans numero WhatsApp valide }
 *       403: { description: Reserve aux administrateurs }
 *       404: { description: Boutique introuvable }
 */

/**
 * @swagger
 * /fastfood/{fastFoodId}/payout-number:
 *   put:
 *     summary: Numero de versement d'une boutique WhatsApp (admin)
 *     description: |
 *       Saisi par l'admin a la creation de la boutique, sans code SMS : enregistre comme numero
 *       verifie du proprietaire (payout_numbers). Recoit le versement automatique de chaque
 *       commande livree (validation par QR), et sert aux retraits de l'app.
 *       Le reseau (Orange / MTN) est detecte par MobileWallet.
 *     tags: [FastFood]
 *     security:
 *       - bearerAuth: []
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
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber: { type: string, example: '677087298' }
 *     responses:
 *       200: { description: "{ success, message, payoutNumber: { phoneNumber, network } }" }
 *       400: { description: Numero invalide, ni Orange ni MTN, ou boutique sans proprietaire }
 *       403: { description: Reserve aux administrateurs }
 *       404: { description: Boutique introuvable }
 */
