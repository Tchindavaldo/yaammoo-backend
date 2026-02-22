// src/routes/bonusRoute.js
const express = require('express');
const { getBonusController } = require('../controllers/bonus/getBonus.controller');
const { postBonusController } = require('../controllers/bonus/postBonus.controller');

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
 *     summary: Get all bonuses
 *     tags:
 *       - Bonus
 *     responses:
 *       200:
 *         description: List of all bonuses
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
 *                     $ref: '#/components/schemas/Bonus'
 */
route.get('/all', getBonusController);

module.exports = route;
