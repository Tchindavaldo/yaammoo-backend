const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');

const router = express.Router();

router.get('/all/:fastfoodId', getOrders);
router.get('/user/all/:userId', getUsersOrders);

// Route POST pour ajouter une commande à un fastfood
router.post('', createOrder);

// Route PUT pour modifier une commande
router.put('', updateOrder);

module.exports = router;
