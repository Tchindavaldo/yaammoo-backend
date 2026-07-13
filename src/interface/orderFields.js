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
  total: { type: 'number', required: true },
  clientId: { type: 'string', required: false },
  periodKey: { type: 'string', required: false },
  selectedPriceIndex: { type: 'number', required: false },
  quantity: { type: 'number', required: true },
  userData: {
    type: 'object',
    required: true,
    properties: {
      firstName: { type: 'string', required: true },
      lastName: { type: 'string', required: true },
      email: { type: 'string', required: true },
      phoneNumber: { type: 'number', required: false }, // Sera validé comme obligatoire si delivery.status est true dans le validateur
      photoUrl: { type: 'string', required: false },
    },
  },
  extra: {
    type: 'array',
    required: true,
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        status: { type: 'boolean', required: true },
        prix: { type: 'number', required: false },
      },
    },
  },
  drink: {
    type: 'array',
    required: true,
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        status: { type: 'boolean', required: true },
        prix: { type: 'number', required: false },
      },
    },
  },
  status: { type: 'string', required: false, allowedValues: ['cancelByUser', 'cancelByFastFood', 'pending', 'pendingToBuy', 'processing', 'finished', 'delivering', 'delivered'] },
  delivery: {
    type: 'object',
    required: true,
    properties: {
      status: { type: 'boolean', required: true },
      date: { type: 'string', required: true },
      type: {
        type: 'string',
        required: false,
        allowedValues: ['express', 'time'],
      },
      time: {
        type: 'string',
        required: false,
      },
      zone: {
        type: 'string',
        required: false,
      },
      prix: {
        type: 'number',
        required: false,
      },
      location: {
        type: 'string',
        required: false,
      },
      phone: { type: 'string', required: false },
      voiceNoteUri: { type: 'string', required: false },
      record: { type: 'string', required: false },
      note: { type: 'string', required: false },
    },
  },
};
