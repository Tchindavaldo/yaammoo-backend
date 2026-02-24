// interfaces/fastfood.js
exports.FastfoodFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  image: { type: 'string', required: false },
  number: { type: 'string', required: false },
  openTime: { type: 'string', required: false },
  closeTime: { type: 'string', required: false },
};
