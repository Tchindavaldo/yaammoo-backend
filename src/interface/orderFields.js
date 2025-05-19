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
  delivery: {
    type: 'object',
    required: false,
    properties: {
      status: { type: 'boolean', required: true },
      type: {
        type: 'string',
        required: false,
        allowedValues: ['express', 'time'],
      },
      time: {
        type: 'string',
        required: false,
        // Validation supplémentaire pour le format d'heure peut être ajoutée dans le validateur
      },
    },
  },
};
