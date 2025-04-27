// interfaces/order.js
exports.FastfoodFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  fastfoodName: { type: 'string', required: true },
  items: { type: 'array', required: false },
  total: { type: 'number', required: false },
  status: { type: 'string', required: false, allowedValues: ['pending', 'processing', 'finished'] },
};
