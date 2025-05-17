const express = require('express');
const router = express.Router();

const { getTransactions, getTransactionById } = require('../controllers/transaction/getTransaction.controller');
const { postTransactionController } = require('../controllers/transaction/postTransaction.controller');
const { updateTransactionController } = require('../controllers/transaction/updateTransaction.controller');

router.post('', postTransactionController);
router.get('/:userId', getTransactions);
router.get('/:id', getTransactionById);

// Routes
router.put('/:id', updateTransactionController);

module.exports = router;
