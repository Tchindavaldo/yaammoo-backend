// src/routes/fastfoodRoutes.js
const express = require('express');
const { createFastfoodController } = require('../controllers/fastfood/createFastfood');
const { getfastfoodController } = require('../controllers/fastfood/getFastFoods');

const route = express.Router();

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
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               image:
 *                 type: string
 *               userId:
 *                 type: string
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
route.post('', createFastfoodController);

/**
 * @swagger
 * /fastFood/all:
 *   get:
 *     summary: Get all fastfood restaurants
 *     tags:
 *       - FastFood
 *     responses:
 *       200:
 *         description: List of all fastfood restaurants
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
 *                     $ref: '#/components/schemas/FastFood'
 */
route.get('/all', getfastfoodController);

module.exports = route;
