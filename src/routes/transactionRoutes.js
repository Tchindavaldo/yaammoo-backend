const express = require('express');
const router = express.Router();

const { getTransactions, getTransactionById } = require('../controllers/transaction/getTransaction.controller');
const { postTransactionController } = require('../controllers/transaction/postTransaction.controller');
const { updateTransactionController } = require('../controllers/transaction/updateTransaction.controller');

/**
 * @swagger
 * /transaction:
 *   post:
 *     summary: Create a new transaction
 *     tags:
 *       - Transactions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - amount
 *               - type
 *             properties:
 *               userId:
 *                 type: string
 *               amount:
 *                 type: number
 *               type:
 *                 type: string
 *                 enum: [deposit, withdrawal, payment]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaction successfully created
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
 *                   $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Invalid input
 */
router.post('', postTransactionController);

/**
 * @swagger
 * /transaction/{userId}:
 *   get:
 *     summary: Get all transactions for a user
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of transactions
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
 *                     $ref: '#/components/schemas/Transaction'
 */
router.get('/:userId', getTransactions);

/**
 * @swagger
 * /transaction/{id}:
 *   get:
 *     summary: Get a transaction by ID
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details
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
 *                   $ref: '#/components/schemas/Transaction'
 *       404:
 *         description: Transaction not found
 */
router.get('/:id', getTransactionById);

/**
 * @swagger
 * /transaction/{id}:
 *   put:
 *     summary: Update a transaction
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, completed, failed]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction successfully updated
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
 *                   $ref: '#/components/schemas/Transaction'
 *       404:
 *         description: Transaction not found
 */
router.put('/:id', updateTransactionController);

module.exports = router;
