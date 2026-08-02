// src/routes/supportRoutes.js
const express = require('express');
const { getSupportThreadsController } = require('../controllers/support/getSupportThreads.controller');
const { getSupportMessagesController } = require('../controllers/support/getSupportMessages.controller');
const { postSupportThreadController } = require('../controllers/support/postSupportThread.controller');
const { postSupportMessageController } = require('../controllers/support/postSupportMessage.controller');
const { markSupportThreadReadController } = require('../controllers/support/markSupportThreadRead.controller');

const route = express.Router();

/**
 * @swagger
 * /support/threads:
 *   get:
 *     summary: Liste des discussions support (sans les messages)
 *     description: >
 *       Fournir exactement un critere : `userId` (fils du client),
 *       `fastFoodId` (fils recus par une boutique) ou `scope=platform`
 *       (fils adresses a la plateforme yaammoo, back-office).
 *     tags:
 *       - Support
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: fastFoodId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: scope
 *         required: false
 *         schema:
 *           type: string
 *           enum: [platform]
 *     responses:
 *       200:
 *         description: Liste des fils, du plus recent au plus ancien
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
 *                       topic:
 *                         type: string
 *                         enum: [question, probleme, assistance, suggestion, discussion]
 *                       fastFood:
 *                         type: object
 *                         nullable: true
 *                         description: null = demande adressee a la plateforme yaammoo
 *                         properties:
 *                           id:
 *                             type: string
 *                           nom:
 *                             type: string
 *                       title:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [open, pending, closed]
 *                       unreadCount:
 *                         type: integer
 *                         description: Non-lus cote client
 *                       supportUnreadCount:
 *                         type: integer
 *                         description: Non-lus cote boutique / back-office
 *                       lastMessage:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *       400:
 *         description: userId manquant
 */
route.get('/threads', getSupportThreadsController);

/**
 * @swagger
 * /support/threads:
 *   post:
 *     summary: Cree une discussion support avec son premier message
 *     tags:
 *       - Support
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - topic
 *               - text
 *             properties:
 *               userId:
 *                 type: string
 *               topic:
 *                 type: string
 *                 enum: [question, probleme, assistance, suggestion, discussion]
 *               fastFoodId:
 *                 type: string
 *                 nullable: true
 *                 description: Absent ou null = demande adressee a la plateforme yaammoo
 *               text:
 *                 type: string
 *               title:
 *                 type: string
 *                 description: Resume du fil ; deduit du texte si absent
 *     responses:
 *       201:
 *         description: Discussion creee (thread + premier message)
 *       400:
 *         description: Payload invalide
 */
route.post('/threads', postSupportThreadController);

/**
 * @swagger
 * /support/threads/{id}/messages:
 *   get:
 *     summary: Messages d'une discussion, par ordre chronologique
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des messages
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
 *                       author:
 *                         type: string
 *                         enum: [user, support]
 *                       text:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *       404:
 *         description: Discussion introuvable
 */
route.get('/threads/:id/messages', getSupportMessagesController);

/**
 * @swagger
 * /support/threads/{id}/messages:
 *   post:
 *     summary: Envoie un message dans une discussion existante
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - text
 *             properties:
 *               userId:
 *                 type: string
 *               text:
 *                 type: string
 *               author:
 *                 type: string
 *                 enum: [user, support]
 *                 description: "'user' par defaut"
 *     responses:
 *       201:
 *         description: Message cree (thread mis a jour + message)
 *       404:
 *         description: Discussion introuvable
 */
route.post('/threads/:id/messages', postSupportMessageController);

/**
 * @swagger
 * /support/threads/{id}/read:
 *   patch:
 *     summary: Remet le compteur de messages non lus a zero
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: side
 *         required: false
 *         description: "'user' (defaut) = non-lus du client ; 'support' = ceux de la boutique / du back-office"
 *         schema:
 *           type: string
 *           enum: [user, support]
 *     responses:
 *       200:
 *         description: Discussion mise a jour
 *       404:
 *         description: Discussion introuvable
 */
route.patch('/threads/:id/read', markSupportThreadReadController);

module.exports = route;
