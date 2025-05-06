// interfaces/order.js
exports.FastfoodFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  status: { type: 'bool', required: false },
  name: { type: 'string', required: false },
  img: { type: 'string', required: false },
  number: { type: 'number', required: false },
  openTime: { type: 'string', required: false },
  closeTime: { type: 'string', required: false },
};
