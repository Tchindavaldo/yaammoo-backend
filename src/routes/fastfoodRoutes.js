// src/routes/fastfoodRoutes.js
const express = require('express');
const { createFastfoodController } = require('../controllers/fastfood/createFastfood');
const { getfastfoodController } = require('../controllers/fastfood/getFastFoods');
const { getfastfood } = require('../controllers/fastfood/getFastFood');
const { updateFastfoodController } = require('../controllers/fastfood/updateFastfood');

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
 *               pickupOnly:
 *                 type: boolean
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
 *     summary: Update a fastfood restaurant
 *     tags:
 *       - FastFood
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
 *               pickupOnly:
 *                 type: boolean
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
 */
route.get('/:fastFoodId', getfastfood);
route.post('/:fastFoodId', updateFastfoodController);

module.exports = route;
