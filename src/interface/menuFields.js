exports.menuFields = {
  id: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  createdAt: { type: 'string', required: false },
  coverImage: { type: 'string', required: true },
  images: {
    type: 'array',
    required: true,
    items: {
      type: 'string',
    },
  },
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
  status: { type: 'string', required: false, allowedValues: ['available', 'unavailable'] },
};
