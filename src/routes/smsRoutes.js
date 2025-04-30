const express = require('express');
const { postWhatsappMessageController } = require('../controllers/sms/whatsapp/whatsapp-message.controller');
const { updateOrder } = require('../controllers/order/updateOrder');

const router = express.Router();

router.post('/whatsapp', postWhatsappMessageController);

module.exports = router;
