const express = require('express');
const { postWhatsappMessageController } = require('../controllers/notifications/whatsapp/whatsapp-message.controller');
const { updateOrder } = require('../controllers/order/updateOrder');

const router = express.Router();

/**
 * @swagger
 * /sms/whatsapp:
 *   post:
 *     summary: Send a WhatsApp message
 *     tags:
 *       - SMS/WhatsApp
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - message
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: WhatsApp message successfully sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input or sending error
 */
router.post('/whatsapp', postWhatsappMessageController);

module.exports = router;
