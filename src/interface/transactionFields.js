// interfaces/transaction.js
exports.TransactionFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  status: { type: 'bool', required: false },
  name: { type: 'string', required: false },
  amount: { type: 'number', required: true },
  createdAt: { type: 'number', required: false },
  payBy: { type: 'string', required: true },
  currentAmount: { type: 'number', required: false },
  type: { type: 'string', required: false },
  // Champs pour paiement MobileWallet
  phone: { type: 'string', required: false },
  network: { type: 'string', required: false },
  email: { type: 'string', required: false },
  // Champs commande
  orderId: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: false },
  items: { type: 'array', required: false },
};
