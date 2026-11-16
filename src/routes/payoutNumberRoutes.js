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
 *       content: { application/json: { schema: { type: object, required: [phoneNumber, network], properties: { phoneNumber: { type: string, example: '698087460' }, network: { type: string, enum: [orange, mtn], description: 'Réseau du numéro : solde débité des frais SMS (coût réel Bird × taux USD->XAF du jour)' } } } } }
 *     responses:
 *       200: { description: "Code envoyé { verificationId, phoneNumber, expiresIn }. App >= payout_number_whatsapp_min_app_version (header x-app-version) et numéro déjà validé sur WhatsApp par ce compte : { verified: true, phoneNumber }, aucun SMS ni frais." }
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

/**
 * @swagger
 * /wallet/payout-number/fee:
 *   get:
 *     summary: Estimation des frais d'un code SMS (avant l'envoi)
 *     description: Moyenne des 50 derniers coûts SMS réels Bird, convertie au taux USD->XAF du jour, arrondie au F supérieur. null si inconnue. Le montant DÉBITÉ est le coût réel de chaque envoi.
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ amount, currency: 'XAF', rate } ou null" }
 */
router.get('/fee', firebaseAuth, c.payoutNumberFeeController);

module.exports = router;
