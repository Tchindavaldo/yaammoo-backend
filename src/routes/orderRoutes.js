const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');

const router = express.Router();

// Route GET pour récupérer les commandes d'un fastfood
router.get('/all/:fastfoodId', getOrders);

// Route POST pour ajouter une commande à un fastfood
router.post('', createOrder);

// Route PUT pour modifier une commande
router.put('', updateOrder);

module.exports = router;
