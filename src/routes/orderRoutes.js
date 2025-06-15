const express = require('express');
const { getOrders } = require('../controllers/order/getOrders');
const { updateOrder } = require('../controllers/order/updateOrder');
const { createOrder } = require('../controllers/order/createOrder');
const { getUsersOrders } = require('../controllers/order/getUsersOrders');
const { updateOrdersConstroller } = require('../controllers/order/updateOrdersConstroller.controller');
const { updateOrdersField } = require('../controllers/order/updateOrdersField.controller');
const { updateOrdersRankByDate } = require('../controllers/order/updateOrdersRankByDate');

const router = express.Router();

router.get('/all/:fastFoodId', getOrders);
router.get('/user/all/:userId', getUsersOrders);

// Route POST pour ajouter une commande à un fastfood
router.post('', createOrder);

// Route PUT pour modifier une commande
router.put('', updateOrder);
router.put('/tabs/:userId', updateOrdersConstroller);

// Route PUT pour mettre à jour un champ spécifique sur plusieurs commandes
router.put('/update-field', updateOrdersField);

// Route PUT pour mettre à jour les rangs des commandes en fonction de la date de création
router.put('/update-rank-by-date/:fastFoodId', updateOrdersRankByDate);

module.exports = router;
