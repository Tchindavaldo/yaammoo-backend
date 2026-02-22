const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Yaammoo Backend API',
      version: '1.0.0',
      description: 'API documentation for Yaammoo Backend - Food delivery platform',
      contact: {
        name: 'Yaammoo Team',
        email: 'support@yaammoo.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: process.env.API_URL || 'https://api.yaammoo.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            role: { type: 'string', enum: ['user', 'fastfood_owner', 'admin'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fastFoodId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            image: { type: 'string' },
            coverImage: { type: 'string' },
            extra: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'boolean' },
                },
              },
            },
            drink: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'boolean' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fastFoodId: { type: 'string' },
            userId: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  menuId: { type: 'string' },
                  quantity: { type: 'number' },
                  price: { type: 'number' },
                },
              },
            },
            totalPrice: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] },
            delivery: {
              type: 'object',
              properties: {
                status: { type: 'boolean' },
                location: { type: 'string' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        FastFood: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            image: { type: 'string' },
            userId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            amount: { type: 'number' },
            type: { type: 'string', enum: ['deposit', 'withdrawal', 'payment'] },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            description: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Bonus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            amount: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            read: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'null' },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/authRoutes.js',
    './src/routes/userRoutes.js',
    './src/routes/menuRoutes.js',
    './src/routes/orderRoutes.js',
    './src/routes/fastfoodRoutes.js',
    './src/routes/imageRoutes.js',
    './src/routes/bonusRoute.js',
    './src/routes/bonusRequestRoute.js',
    './src/routes/transactionRoutes.js',
    './src/routes/notificationRoutes.js',
    './src/routes/smsRoutes.js',
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
