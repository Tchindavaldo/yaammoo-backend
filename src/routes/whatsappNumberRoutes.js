const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middlewares/authMiddleware');
const c = require('../controllers/wallet/payoutNumber.controller');

/**
 * @swagger
 * /whatsapp-number/request:
 *   post:
 *     summary: Envoie un code sur WhatsApp UNIQUEMENT (aucun repli SMS) pour vérifier le WhatsApp de la boutique
 *     tags: [Fastfood]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { type: object, required: [phoneNumber], properties: { phoneNumber: { type: string } } } } }
 *     responses:
 *       200: { description: "Code envoyé. App >= payout_number_whatsapp_min_app_version (header x-app-version) et numéro déjà validé comme numéro de retrait par ce compte : { verified: true, phoneNumber }, aucun code." }
 *       429: { description: "cooldown (Retry-After)" }
 * /whatsapp-number/verify:
 *   post:
 *     summary: Valide le code ; refusé si Bird ne l'a pas livré par WhatsApp
 *     tags: [Fastfood]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content: { application/json: { schema: { type: object, required: [phoneNumber, code], properties: { phoneNumber: { type: string }, code: { type: string } } } } }
 *     responses:
 *       200: { description: Numéro WhatsApp vérifié }
 *       401: { description: Code refusé }
 * /whatsapp-number:
 *   get:
 *     summary: Numéros WhatsApp vérifiés du compte (source otp, login, inbound ou payout)
 *     tags: [Fastfood]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/request', firebaseAuth, c.requestWhatsappNumberCodeController);
router.post('/verify', firebaseAuth, c.verifyWhatsappNumberCodeController);
router.get('/', firebaseAuth, c.listWhatsappNumbersController);

module.exports = router;
