// interfaces/order.js
exports.bonusRequestFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  bonusType: { type: 'string', required: true },
  bonusId: { type: 'string', required: true },
  status: { type: 'array', required: false },
};
