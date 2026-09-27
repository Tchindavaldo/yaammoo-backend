// src/routes/bonusRequestRoute.js
const express = require('express');
const { postBonusRequestController } = require('../controllers/bonusRequest/postBonusRequest.controller');
const { getBonusRequestStatusController } = require('../controllers/bonusRequest/getBonusRequestStatus.controller');
const firebaseAuth = require('../middlewares/authMiddleware');
const { authorize, selfFromBody, bonusRequestFromParam } = require('../middlewares/staffPermissionMiddleware');

const route = express.Router();

/**
 * @swagger
 * /bonusRequest/{totalBonus}:
 *   post:
 *     summary: Create a bonus request
 *     tags:
 *       - Bonus Request
 *     parameters:
 *       - in: path
 *         name: totalBonus
 *         required: true
 *         schema:
 *           type: number
 *         description: Total bonus amount
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bonus request successfully created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input
 */
route.post('/:totalBonus', firebaseAuth, authorize(selfFromBody('userId')), postBonusRequestController);

/**
 * @swagger
 * /bonusRequest/status/{id}:
 *   get:
 *     summary: Get bonus request status
 *     tags:
 *       - Bonus Request
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bonus request ID
 *     responses:
 *       200:
 *         description: Bonus request status
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
 *                   type: object
 *       404:
 *         description: Bonus request not found
 */
route.get('/status/:id', firebaseAuth, authorize(bonusRequestFromParam), getBonusRequestStatusController);

module.exports = route;
