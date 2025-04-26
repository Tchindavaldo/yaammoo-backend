const express = require('express');
const { createOrder } = require('../controllers/order/createOrder');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder'); // Import the updateOrder controller

const router = express.Router();

// Route GET pour récupérer les commandes d'un fastfood
router.get('/all/:fastfoodId', getOrders);

// Route POST pour ajouter une commande à un fastfood
router.post('/:fastfoodId', createOrder);

// Route PUT pour modifier une commande
router.put('/:orderId', updateOrder);

module.exports = router;
