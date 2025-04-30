// interfaces/order.js
exports.menuFields = {
  id: { type: 'string', required: false },
  fastfoodId: { type: 'string', required: true },
  Name: { type: 'string', required: true },
  createdAt: { type: 'string', required: false },
  // items: { type: 'array', required: false },
  price: { type: 'number', required: false },
  status: { type: 'string', required: false, allowedValues: ['avaible', 'unAvaible'] },
};
