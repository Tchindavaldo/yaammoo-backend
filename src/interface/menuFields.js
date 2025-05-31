exports.menuFields = {
  id: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  createdAt: { type: 'string', required: false },
  updatedAt: { type: 'string', required: false },
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
    required: true,
    items: {
      type: 'object',
      properties: {
        price: { type: 'number', required: true },
        description: { type: 'string', required: false },
      },
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
      },
    },
  },
  status: { type: 'string', required: false, allowedValues: ['available', 'unavailable'] },
};
