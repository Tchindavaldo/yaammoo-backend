exports.menuFields = {
  id: { type: 'string', required: false },
  fastFoodId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  createdAt: { type: 'string', required: false },
  updatedAt: { type: 'string', required: false },
  coverImage: { type: 'string', required: true },
  coverImageHasBackground: { type: 'boolean', required: true },
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
        // Prix RÉEL du fastfood, servi à côté du prix affiché par
        // `applyDisplayPricing`. Le front le renvoie dans la commande pour
        // figer le prix de l'époque (vue marchand). Jamais utilisé dans un
        // calcul d'argent : le montant payé reste contrôlé sur `price`.
        prixBrut: { type: 'number', required: false },
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
        prix: { type: 'number', required: false },
        prixBrut: { type: 'number', required: false },
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
        prix: { type: 'number', required: false },
        prixBrut: { type: 'number', required: false },
        quantite: { type: 'number', required: false },
      },
    },
  },
  status: { type: 'string', required: false, allowedValues: ['available', 'unavailable'] },
  stock: { type: 'number', required: false },
};
