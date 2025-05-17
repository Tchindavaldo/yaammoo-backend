const updateTransaction = async (transactionId, updateData) => {
  try {
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  updateTransaction,
};
