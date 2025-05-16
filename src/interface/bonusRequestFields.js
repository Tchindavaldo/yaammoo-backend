// interfaces/order.js
exports.bonusRequestFields = {
  id: { type: 'string', required: false },
  fcmToken: { type: 'string', required: true },
  userId: { type: 'string', required: true },
  bonusType: { type: 'string', required: true },
  bonusId: { type: 'string', required: true },
  status: { type: 'array', required: false },
};
