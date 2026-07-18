// src/routes/bonusRoute.js
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { getBonusController } = require('../controllers/bonus/getBonus.controller');
const { postBonusController } = require('../controllers/bonus/postBonus.controller');
const { claimBonusController } = require('../controllers/bonus/claimBonus.controller');

const route = express.Router();

/**
 * @swagger
 * /bonus:
 *   post:
 *     summary: Create a new bonus
 *     tags:
 *       - Bonus
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - amount
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Bonus successfully created
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
 *                   $ref: '#/components/schemas/Bonus'
 *       400:
 *         description: Invalid input
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

module.exports = route;
