// interfaces/order.js
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
};
