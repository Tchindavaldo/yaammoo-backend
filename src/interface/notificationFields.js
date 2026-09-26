// interfaces/order.js
exports.notificationFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: false },
  type: { type: 'string', required: true },
  title: { type: 'string', required: true },
  target: { type: 'string', required: false },
  body: { type: 'string', required: true },
  allNotif: { type: 'array', required: false },
  // Notifications boutique (migration 053) : image jointe et deep-link.
  imageUrl: { type: 'string', required: false },
  route: { type: 'string', required: false },
};
