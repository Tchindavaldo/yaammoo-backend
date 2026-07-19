// src/routes/bonusRoute.js
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { getBonusController } = require('../controllers/bonus/getBonus.controller');
const { postBonusController } = require('../controllers/bonus/postBonus.controller');
const { claimBonusController } = require('../controllers/bonus/claimBonus.controller');
const { redeemBonusController } = require('../controllers/bonus/redeemBonus.controller');

const route = express.Router();

/**
 * @swagger
 * /bonus:
 *   post:
 *     summary: Crée un bonus (définition uniquement)
 *     description: >
 *       Seule la DÉFINITION est persistée. Les champs dépendant de
 *       l'utilisateur (`bonusStats`, `requestStatus`, compteurs…) sont
 *       recalculés au GET et sont rejetés ici.
 *     tags:
 *       - Bonus
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - name
 *               - criteria
 *               - claimDuration
 *               - usageLimit
 *             properties:
 *               type:
 *                 type: string
 *                 description: Chaîne libre (netflix, free_delivery, free_meal, discount…)
 *                 example: netflix
 *               name:
 *                 type: string
 *                 example: 1 mois Netflix offert
 *               description:
 *                 type: string
 *               criteria:
 *                 type: object
 *                 description: >
 *                   `target` et `period` sont requis pour `order_count` et
 *                   `amount_spent`, et interdits pour `welcome`.
 *                 required:
 *                   - kind
 *                 properties:
 *                   kind:
 *                     type: string
 *                     enum: [welcome, order_count, amount_spent]
 *                   target:
 *                     type: number
 *                     example: 50000
 *                   period:
 *                     type: string
 *                     enum: [day, week, month]
 *               fastFoodId:
 *                 type: string
 *                 description: Absent/null = bonus plateforme yaammoo
 *               fastFoodName:
 *                 type: string
 *                 description: Requis si `fastFoodId` est présent
 *               active:
 *                 type: boolean
 *                 default: true
 *               claimDuration:
 *                 type: number
 *                 description: Validité du code après réclamation (jours)
 *                 example: 30
 *               usageLimit:
 *                 type: number
 *                 description: Nombre d'utilisations autorisées du code
 *                 example: 3
 *     responses:
 *       201:
 *         description: Bonus créé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400:
 *         description: Définition invalide
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field: { type: string }
 *                       message: { type: string }
 */
route.post('', postBonusController);

/**
 * @swagger
 * /bonus/all:
 *   get:
 *     summary: Liste tous les bonus, enrichis pour l'utilisateur courant
 *     description: >
 *       Retourne la définition de chaque bonus fusionnée avec les données
 *       propres à l'utilisateur authentifié : progression `bonusStats`
 *       (calculée depuis ses commandes), compteurs et état de sa demande.
 *     tags:
 *       - Bonus
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des bonus enrichis
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
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: bns_123 }
 *                       type: { type: string, example: netflix }
 *                       name: { type: string }
 *                       description: { type: string }
 *                       criteria:
 *                         type: object
 *                         properties:
 *                           kind: { type: string, enum: [welcome, order_count, amount_spent] }
 *                           target: { type: number }
 *                           period: { type: string, enum: [day, week, month] }
 *                       fastFoodId: { type: string, nullable: true }
 *                       fastFoodName: { type: string, nullable: true }
 *                       active: { type: boolean }
 *                       claimDuration: { type: number, description: validité du code (jours) }
 *                       usageLimit: { type: number }
 *                       createdAt: { type: string, format: date-time }
 *                       bonusStats:
 *                         type: object
 *                         properties:
 *                           day: { type: object, properties: { count: { type: number }, amount: { type: number } } }
 *                           week: { type: object, properties: { count: { type: number }, amount: { type: number } } }
 *                           month: { type: object, properties: { count: { type: number }, amount: { type: number } } }
 *                       fastFoodBonusCount: { type: number }
 *                       totalClaimedCount: { type: number }
 *                       userClaimedCount: { type: number }
 *                       requestStatus: { type: string, enum: [none, pending, approved] }
 *                       claimedAt: { type: string, format: date-time, nullable: true }
 *                       usageCount: { type: number }
 *                       redeemed: { type: boolean }
 *       401:
 *         description: Token manquant ou invalide
 */
route.get('/all', firebaseAuth, getBonusController);

/**
 * @swagger
 * /bonus/{id}/claim:
 *   post:
 *     summary: Réclamer un bonus (fidélité) pour l'utilisateur courant
 *     description: >
 *       Réclamation auto-approuvée : le backend vérifie que le palier
 *       (`criteria.target` sur `criteria.period`) est atteint via les commandes
 *       du user (ou `welcome` = toujours éligible), puis enregistre une
 *       réclamation `approved`. Une seule réclamation active par bonus.
 *     tags:
 *       - Bonus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Id du bonus à réclamer
 *     responses:
 *       201:
 *         description: Bonus réclamé
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
 *                     bonusId: { type: string }
 *                     requestStatus: { type: string, enum: [none, pending, approved] }
 *                     claimedAt: { type: string, format: date-time, nullable: true }
 *                     userClaimedCount: { type: number }
 *       400:
 *         description: Bonus inactif ou palier non atteint
 *       401:
 *         description: Token manquant ou invalide
 *       404:
 *         description: Bonus non trouvé
 *       409:
 *         description: Réclamation déjà active pour ce bonus
 */
route.post('/:id/claim', firebaseAuth, claimBonusController);

/**
 * @swagger
 * /bonus/redeem:
 *   post:
 *     summary: Consommer une utilisation du code bonus (à la commande)
 *     description: >
 *       Appelé au moment de la commande, quand le user utilise le code reçu
 *       lors de la réclamation. Incrémente `usageCount`, vérifie l'expiration
 *       (`claimedAt` + `claimDuration` jours) et `usageLimit`. Passe
 *       `redeemed: true` une fois la limite atteinte.
 *     tags:
 *       - Bonus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 example: YAM-7K3F9Q
 *               orderId:
 *                 type: string
 *                 description: Commande sur laquelle le bonus est consommé (optionnel)
 *     responses:
 *       200:
 *         description: Utilisation consommée
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
 *                     bonusId: { type: string }
 *                     code: { type: string }
 *                     usageCount: { type: number }
 *                     usageLimit: { type: number, nullable: true }
 *                     remainingUses: { type: number, nullable: true }
 *                     redeemed: { type: boolean }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *       400:
 *         description: Code requis, bonus non réclamé, ou code expiré
 *       401:
 *         description: Token manquant ou invalide
 *       403:
 *         description: Le code n'appartient pas à l'utilisateur
 *       404:
 *         description: Code bonus introuvable
 *       409:
 *         description: Code déjà entièrement consommé / limite atteinte
 */
route.post('/redeem', firebaseAuth, redeemBonusController);

module.exports = route;
