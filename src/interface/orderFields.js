// interfaces/order.js
exports.OrderFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  fastfoodId: { type: 'string', required: true },
  clientName: { type: 'string', required: false },
  createdAt: { type: 'string', required: false },
  updatedAt: { type: 'string', required: false },
  items: { type: 'array', required: false },
  total: { type: 'number', required: false },
  status: { type: 'string', required: true, allowedValues: ['pending', 'pendingToBuy', 'processing', 'finished'] },
};
