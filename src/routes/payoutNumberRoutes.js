const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const c = require('../controllers/wallet/payoutNumber.controller');

/**
 * @swagger
 * /wallet/payout-number/request:
 *   post:
 *     summary: Envoie un code par SMS UNIQUEMENT pour vérifier un numéro de retrait (OM / MoMo)
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { type: object, required: [phoneNumber], properties: { phoneNumber: { type: string, example: '698087460' } } } } }
 *     responses:
 *       200: { description: "Code envoyé { verificationId, phoneNumber, expiresIn }" }
 *       429: { description: "cooldown (en-tête Retry-After)" }
 */
router.post('/request', firebaseAuth, c.requestPayoutNumberCodeController);

/**
 * @swagger
 * /wallet/payout-number/verify:
 *   post:
 *     summary: Valide le code ; le numéro devient un numéro de retrait vérifié (aucune connexion)
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { type: object, required: [phoneNumber, code], properties: { phoneNumber: { type: string }, code: { type: string } } } } }
 *     responses:
 *       200: { description: "{ phoneNumber } vérifié" }
 *       401: { description: "Code refusé { reason, attemptsRemaining }" }
 */
router.post('/verify', firebaseAuth, c.verifyPayoutNumberCodeController);

/**
 * @swagger
 * /wallet/payout-number:
 *   get:
 *     summary: Numéros de retrait vérifiés du compte
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', firebaseAuth, c.listPayoutNumbersController);

module.exports = router;
