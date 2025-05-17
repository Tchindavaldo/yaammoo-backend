const { updateTransaction } = require('../../services/transaction/updateTransaction.services');

const updateTransactionController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedTransaction = await updateTransaction(id, updateData);

    res.status(200).json({
      status: 'success',
      data: {
        transaction: updatedTransaction,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateTransactionController,
};
