const { menuFields } = require('./menuFields');

// interfaces/order.js
exports.OrderFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  fastFoodId: { type: 'string', required: true },
  clientName: { type: 'string', required: false },
  createdAt: { type: 'string', required: false },
  updatedAt: { type: 'string', required: false },
  menu: { type: 'object', required: true, properties: menuFields },
  items: { type: 'array', required: false },
  total: { type: 'number', required: false },
  status: { type: 'string', required: false, allowedValues: ['pending', 'pendingToBuy', 'processing', 'finished'] },
};
