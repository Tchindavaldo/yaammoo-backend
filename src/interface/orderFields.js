// interfaces/order.js
exports.OrderFields = {
  id: { type: 'string', required: true },
  userId: { type: 'string', required: true },
  createdAt: { type: 'type', required: false },
  updatedAt: { type: 'type', required: false },
  fastfoodId: { type: 'string', required: true },
  clientName: { type: 'string', required: true },
  items: { type: 'array', required: true },
  total: { type: 'number', required: true },
  status: { type: 'string', required: true, allowedValues: ['pending', 'processing', 'finished'] },
};
