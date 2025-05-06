const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');
const { updatePendingToBuyOrdersConstroller } = require('../controllers/order/updatePendingToBuyOrders.controller');

const router = express.Router();

router.get('/all/:fastFoodId', getOrders);
router.get('/user/all/:userId', getUsersOrders);

// Route POST pour ajouter une commande à un fastfood
router.post('', createOrder);

// Route PUT pour modifier une commande
router.put('', updateOrder);
router.put('/pending-toBuy', updatePendingToBuyOrdersConstroller);

module.exports = router;
