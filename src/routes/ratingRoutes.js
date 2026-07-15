const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const { getOrderRatingController } = require('../controllers/rating/getOrderRating.controller');

const router = express.Router();

/**
 * @swagger
 * /rating/order/{orderId}:
 *   get:
 *     summary: Note laissée par l'utilisateur pour une commande
 *     description: >
 *       Retourne la note (value + comment) que l'utilisateur authentifié a donnée
 *       pour le plat ET/OU le livreur d'une commande. Permet au front d'afficher
 *       "Vous avez déjà noté" ou de pré-remplir le formulaire de note.
 *       La commande doit appartenir à l'utilisateur connecté.
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Notes trouvées (ou null si pas encore noté)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                     menuRating:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id: { type: string }
 *                         targetType: { type: string }
 *                         targetId: { type: string }
 *                         userId: { type: string }
 *                         orderId: { type: string }
 *                         value: { type: integer }
 *                         comment: { type: string, nullable: true }
 *                         createdAt: { type: string, format: date-time }
 *                         updatedAt: { type: string, format: date-time }
 *                     driverRating:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id: { type: string }
 *                         targetType: { type: string }
 *                         targetId: { type: string }
 *                         userId: { type: string }
 *                         orderId: { type: string }
 *                         value: { type: integer }
 *                         comment: { type: string, nullable: true }
 *                         createdAt: { type: string, format: date-time }
 *                         updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: La commande n'appartient pas à cet utilisateur
 *       404:
 *         description: Commande non trouvée
 */
router.get('/order/:orderId', firebaseAuth, getOrderRatingController);

module.exports = router;
