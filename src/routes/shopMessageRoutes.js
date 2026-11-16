// Messages d'une boutique WhatsApp au client (posés par l'agent IA). Doc : architecture/whatsapp-ai.md.
const express = require('express');
const firebaseAuth = require('../middlewares/authMiddleware');
const c = require('../controllers/whatsapp/shopMessages.controller');

const router = express.Router();

/**
 * @swagger
 * /shop-messages:
 *   get:
 *     summary: Messages et questions des boutiques WhatsApp au client connecté (30 derniers jours)
 *     description: >
 *       Posés par l'agent IA à la demande du marchand. Socket temps réel `shop.message`
 *       (nouveau message) et `shop.messageUpdated` (réponse enregistrée), donnée complète `{ data }`.
 *     tags: [WhatsApp]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste, plus récents d'abord
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ShopMessage' }
 * /shop-messages/{id}/answer:
 *   post:
 *     summary: Le client répond à une question de la boutique (relayée au marchand sur WhatsApp)
 *     tags: [WhatsApp]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answer]
 *             properties:
 *               answer: { type: string, maxLength: 1000 }
 *     responses:
 *       200: { description: Réponse enregistrée, data = ShopMessage }
 *       400: { description: Réponse vide / trop longue, ou message sans question }
 *       404: { description: Message introuvable ou d'un autre client }
 *       409: { description: Question déjà répondue }
 * components:
 *   schemas:
 *     ShopMessage:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         orderId: { type: string }
 *         orderRef: { type: string, description: "n° court de la commande (6 caractères)" }
 *         fastFoodId: { type: string }
 *         fastFood: { type: object, properties: { id: { type: string }, name: { type: string }, image: { type: string, nullable: true } } }
 *         userId: { type: string }
 *         text: { type: string }
 *         expectsAnswer: { type: boolean, description: "true = question, le client peut répondre" }
 *         answer: { type: string, nullable: true }
 *         status: { type: string, enum: [open, answered, closed] }
 *         createdAt: { type: string, format: date-time }
 *         answeredAt: { type: string, format: date-time, nullable: true }
 */
router.get('/', firebaseAuth, c.listShopMessagesController);
router.post('/:id/answer', firebaseAuth, c.answerShopMessageController);

module.exports = router;
