const express = require('express');
const router = express.Router();

const { getTransactions, getTransactionById } = require('../controllers/transaction/getTransaction.controller');
const { postTransactionController } = require('../controllers/transaction/postTransaction.controller');
const { updateTransactionController } = require('../controllers/transaction/updateTransaction.controller');
const { webhookMobilewalletController } = require('../controllers/transaction/webhookMobilewallet.controller');

/**
 * @swagger
 * /transaction:
 *   post:
 *     summary: Initie une transaction (paiement Mobile Money via MobileWallet)
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
 *               - payBy
 *             properties:
 *               userId:
 *                 type: string
 *                 description: uid Firebase de l'utilisateur
 *               amount:
 *                 type: number
 *                 description: Montant en XAF
 *               payBy:
 *                 type: string
 *                 enum: [mobilemoney]
 *                 description: Mode de paiement
 *               phone:
 *                 type: string
 *                 description: Numéro de téléphone (requis si payBy=mobilemoney). Le backend passe le numéro tel quel à MobileWallet.
 *               network:
 *                 type: string
 *                 enum: [MTN, Orangemoney]
 *                 description: Opérateur (requis si payBy=mobilemoney)
 *               email:
 *                 type: string
 *                 description: Email utilisateur (optionnel, défaut yaammoo@rauval.com)
 *               items:
 *                 type: array
 *                 description: "Commandes complètes (requis si payBy=mobilemoney). Chaque item doit porter un fastFoodId."
 *                 items:
 *                   type: object
 *                   required: [fastFoodId, menu, quantity, total]
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: "Présent si commande déjà en base (panier pendingToBuy) → updateOrders. Absent → createOrderService."
 *                     fastFoodId:
 *                       type: string
 *                     menu:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *                     quantity:
 *                       type: number
 *                     total:
 *                       type: number
 *                     delivery:
 *                       type: object
 *                     status:
 *                       type: string
 *                       enum: [pending, pendingToBuy]
 *     responses:
 *       200:
 *         description: Initiation réussie — attendre le verdict via socket payment.settled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   example: ussd_sent
 *                 mw_transaction_id:
 *                   type: string
 *                 payment_number:
 *                   type: string
 *                   description: Code USSD à taper par le client (*123*{payment_number}#)
 *       400:
 *         description: Validation échouée (champs manquants, items sans fastFoodId)
 *       409:
 *         description: "Doublon (pending_exists / retry_too_soon) ou stock insuffisant (insufficient_stock)"
 *       503:
 *         description: Opérateur ou réseau indisponible
 *       502:
 *         description: Erreur serveur MobileWallet
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

/**
 * @swagger
 * /transaction/webhook/mobilewallet:
 *   post:
 *     summary: Webhook entrant MobileWallet — verdict de paiement (usage interne)
 *     description: "Appelé par MobileWallet après verdict USSD. Retourne toujours 200 pour éviter les retries. Ne pas appeler manuellement."
 *     tags:
 *       - Transactions
 *     responses:
 *       200:
 *         description: Toujours 200 (même en cas d'erreur interne)
 */
router.post('/webhook/mobilewallet', webhookMobilewalletController);

module.exports = router;
