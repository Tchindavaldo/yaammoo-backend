// interfaces/fastfood.js
exports.FastfoodFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  image: { type: 'string', required: false },
  number: { type: 'string', required: false },
  momoNumber: { type: 'string', required: false },
  whatsappNumber: { type: 'string', required: false },
  openTime: { type: 'string', required: false },
  closeTime: { type: 'string', required: false },
  orderLeadTime: { type: 'number', required: false },
  advanceDays: { type: 'number', required: false },
  pickupOnly: { type: 'bool', required: false },
  cities: { type: 'array', required: false },
  deliveryHours: {
    type: 'array',
    required: false,
  },
};
