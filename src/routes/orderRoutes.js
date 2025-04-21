const express = require('express');
const { createOrder } = require('../controllers/order/createOrder');

const router = express.Router();

// Route POST pour ajouter une commande à un fastfood
router.post('/:fastfoodId', createOrder);

module.exports = router;
