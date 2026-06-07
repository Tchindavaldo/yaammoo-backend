// interfaces/transaction.js
exports.TransactionFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  status: { type: 'bool', required: false },
  name: { type: 'string', required: true },
  amount: { type: 'number', required: true },
  createdAt: { type: 'number', required: false },
  payBy: { type: 'string', required: true },
  currentAmount: { type: 'number', required: true },
  type: { type: 'string', required: true },
  // Champs pour paiement MobileWallet
  phone: { type: 'string', required: false },
  network: { type: 'string', required: false },
  email: { type: 'string', required: false },
};
