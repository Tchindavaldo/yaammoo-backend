exports.menuFields = {
  id: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  createdAt: { type: 'string', required: false },
  prices: {
    type: 'array',
    required: false,
    items: {
      type: 'object',
      properties: {
        price: { type: 'number', required: true },
        description: { type: 'string', required: false },
      },
    },
  },
  status: { type: 'string', required: false, allowedValues: ['avaible', 'unAvaible'] },
};
