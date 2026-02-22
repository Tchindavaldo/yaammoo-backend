const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');
const { updateOrdersConstroller } = require('../controllers/order/updateOrdersConstroller.controller');
const { updateOrdersField } = require('../controllers/order/updateOrdersField.controller');
const { updateOrdersRankByDate } = require('../controllers/order/updateOrdersRankByDate');

const router = express.Router();

/**
 * @swagger
 * /order/all/{fastFoodId}:
 *   get:
 *     summary: Get all orders for a fastfood
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: List of orders
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
 *                     $ref: '#/components/schemas/Order'
 */
router.get('/all/:fastFoodId', getOrders);

/**
 * @swagger
 * /order/user/all/{userId}:
 *   get:
 *     summary: Get all orders for a user
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user orders
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
 *                     $ref: '#/components/schemas/Order'
 */
router.get('/user/all/:userId', getUsersOrders);

/**
 * @swagger
 * /order:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fastFoodId
 *               - userId
 *               - items
 *               - totalPrice
 *             properties:
 *               fastFoodId:
 *                 type: string
 *               userId:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     menuId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *               totalPrice:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, preparing, ready, delivered, cancelled]
 *               delivery:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                   location:
 *                     type: string
 *     responses:
 *       201:
 *         description: Order successfully created
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
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid input
 */
router.post('', createOrder);

/**
 * @swagger
 * /order:
 *   put:
 *     summary: Update an order
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, preparing, ready, delivered, cancelled]
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               totalPrice:
 *                 type: number
 *     responses:
 *       200:
 *         description: Order successfully updated
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
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
router.put('', updateOrder);

/**
 * @swagger
 * /order/tabs/{userId}:
 *   put:
 *     summary: Update orders for a user (tabs)
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Orders successfully updated
 */
router.put('/tabs/:userId', updateOrdersConstroller);

/**
 * @swagger
 * /order/update-field:
 *   put:
 *     summary: Update a specific field on multiple orders
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderIds
 *               - field
 *               - value
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               field:
 *                 type: string
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Orders successfully updated
 */
router.put('/update-field', updateOrdersField);

/**
 * @swagger
 * /order/update-rank-by-date/{fastFoodId}:
 *   put:
 *     summary: Update order ranks by creation date
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: fastFoodId
 *         required: true
 *         schema:
 *           type: string
 *         description: FastFood ID
 *     responses:
 *       200:
 *         description: Order ranks successfully updated
 */
router.put('/update-rank-by-date/:fastFoodId', updateOrdersRankByDate);

module.exports = router;
