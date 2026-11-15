// Réception des événements du module WhatsApp de rauval-backend. Montée AVANT express.json
// dans app.js : la signature X-Rauval-Signature se vérifie sur le corps brut.
const express = require('express');
const { receiveWhatsappEvent } = require('../controllers/whatsapp/webhook.controller');

const router = express.Router();

/**
 * @swagger
 * /whatsapp/webhook:
 *   post:
 *     summary: Événement WhatsApp relayé par le module de rauval-backend (message reçu, statut)
 *     description: |
 *       Appelé uniquement par le module (pas par l'app). Signé :
 *       X-Rauval-Signature = "sha256=" + HMAC-SHA256(WHATSAPP_WEBHOOK_SECRET, "<X-Rauval-Timestamp>.<corps>").
 *       Un timestamp de plus de 5 minutes est refusé. Champs : interface/whatsappWebhookFields.js.
 *     tags:
 *       - WhatsApp
 *     parameters:
 *       - in: header
 *         name: X-Rauval-Event
 *         schema: { type: string, enum: [message, status] }
 *       - in: header
 *         name: X-Rauval-Timestamp
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: X-Rauval-Signature
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event, wamid]
 *             properties:
 *               event: { type: string, enum: [message, status] }
 *               wamid: { type: string }
 *               from: { type: string }
 *               type: { type: string }
 *               button: { type: object, properties: { id: { type: string }, title: { type: string } } }
 *               status: { type: string }
 *     responses:
 *       200: { description: "Reçu ({ success, handled })" }
 *       400: { description: JSON ou événement invalide }
 *       401: { description: Signature absente, invalide ou expirée }
 *       500: { description: Erreur pendant le traitement }
 */
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), receiveWhatsappEvent);

module.exports = router;
