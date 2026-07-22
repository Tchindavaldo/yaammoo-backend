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
        // Forme RÉELLE d'une commande (cf. mappers.orderFromSupabase et
        // interface/orderFields.js). Une commande = UN menu en `quantity`
        // exemplaires — il n'y a pas de tableau `items`.
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            fastFoodId: { type: 'string' },
            menu: {
              type: 'object',
              description: 'Snapshot du menu au moment de la commande (figé : le catalogue peut changer ensuite).',
              allOf: [{ $ref: '#/components/schemas/Menu' }],
            },
            quantity: { type: 'number' },
            selectedPriceIndex: {
              type: 'number',
              nullable: true,
              description: 'Index du prix retenu parmi prix1/prix2/prix3 du menu.',
            },
            extra: {
              type: 'array',
              description: 'Suppléments retenus, avec leur prix.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'boolean' },
                  prix: { type: 'number' },
                },
              },
            },
            drink: {
              type: 'array',
              description: 'Boissons retenues, avec leur prix.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'boolean' },
                  prix: { type: 'number' },
                },
              },
            },
            delivery: { $ref: '#/components/schemas/OrderDelivery' },
            total: { type: 'number', description: 'Montant total de la commande.' },
            status: {
              type: 'string',
              enum: ['pendingToBuy', 'pending', 'processing', 'finished', 'delivering', 'delivered', 'cancelByUser', 'cancelByFastFood'],
            },
            rank: { type: 'number', description: "Rang dans la file du fastfood pour (statut, date de livraison)." },
            clientId: { type: 'string' },
            periodKey: { type: 'string' },
            groupId: {
              type: 'string',
              nullable: true,
              description:
                "Commandes d'un même panier, à réafficher ensemble (une commande = un plat). " +
                'Renseigné par le backend au passage en `pending`, jamais envoyé par le client.',
            },
            driverId: { type: 'string', nullable: true, description: 'Livreur assigné à CETTE commande.' },
            userData: {
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                email: { type: 'string' },
                phoneNumber: { type: 'number' },
                photoUrl: { type: 'string' },
              },
            },
            deliveryOffer: {
              allOf: [{ $ref: '#/components/schemas/DeliveryOffer' }],
              nullable: true,
              description: 'Renseigné quand un bonus livraison a été appliqué à la commande.',
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        OrderDelivery: {
          type: 'object',
          description: "Informations de livraison d'une commande (cf. interface/orderFields.js).",
          required: ['status', 'date'],
          properties: {
            status: { type: 'boolean', description: 'true = livraison, false = retrait sur place.' },
            date: { type: 'string', description: 'Date de livraison (YYYY-MM-DD).' },
            type: { type: 'string', enum: ['express', 'time'] },
            time: { type: 'string', description: 'Heure souhaitée (HH:mm), si type = time.' },
            zone: { type: 'string', description: 'Zone de livraison choisie.' },
            prix: { type: 'number', description: 'Frais de livraison. Toujours renvoyé au montant réel, jamais forcé à 0 : la gratuité est portée par `deliveryOffer`.' },
            location: { type: 'string' },
            phone: { type: 'string' },
            voiceNoteUri: { type: 'string' },
            record: { type: 'string' },
            note: { type: 'string' },
          },
        },
        DeliveryOffer: {
          type: 'object',
          nullable: true,
          description:
            "Offre de livraison applicable. Porte des DONNÉES, pas une consigne d'affichage : le front décide seul du rendu. " +
            "`null` quand aucune offre ne s'applique, ou quand l'appelant n'est pas authentifié.",
          properties: {
            active: { type: 'boolean' },
            reason: {
              type: 'string',
              enum: ['bonus', 'campaign'],
              description: "`bonus` = bonus du user ; `campaign` = mode gratuité globale plateforme.",
            },
            coveredBy: {
              type: 'string',
              enum: ['fastfood', 'platform'],
              description: 'Qui renonce au montant de la livraison.',
            },
            bonusId: { type: 'string', nullable: true },
            bonusCode: { type: 'string', nullable: true },
            bonusName: { type: 'string', nullable: true },
            fastFoodId: { type: 'string', nullable: true, description: 'null = bonus plateforme, valable partout.' },
          },
        },
        // Forme RÉELLE (cf. interface/fastfoodFields.js et mappers.fastfoodFromSupabase).
        // Les anciens champs `description`, `address` et `phone` n'existent pas.
        FastFood: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', description: 'uid du propriétaire.' },
            name: { type: 'string' },
            image: { type: 'string' },
            number: { type: 'string' },
            momoNumber: { type: 'string' },
            whatsappNumber: { type: 'string' },
            openTime: { type: 'string', example: '09:00' },
            closeTime: { type: 'string', example: '22:00' },
            orderLeadTime: { type: 'number', description: 'Délai avant livraison (minutes).' },
            advanceDays: { type: 'number' },
            pickupOnly: { type: 'boolean', description: 'true = retrait uniquement, aucune livraison.' },
            cities: { type: 'array', items: { type: 'string' } },
            deliveryHours: {
              type: 'array',
              description:
                'Créneaux de livraison avec zones et prix. Deux formats coexistent selon la version du client ' +
                '(cf. utils/deliveryHoursFormat.js) : legacy = tableau de "HH:mm", actuel = tableau d\'objets.',
              items: { $ref: '#/components/schemas/DeliveryHour' },
            },
            driverRatingAvg: { type: 'number' },
            driverRatingCount: { type: 'number' },
            pricing: { $ref: '#/components/schemas/FastFoodPricing' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        DeliveryHour: {
          type: 'object',
          properties: {
            hour: { type: 'string', example: '08:00' },
            periodic: { type: 'boolean' },
            periodicZones: { type: 'array', items: { $ref: '#/components/schemas/DeliveryZone' } },
            express: { type: 'boolean' },
            expressZones: { type: 'array', items: { $ref: '#/components/schemas/DeliveryZone' } },
          },
        },
        DeliveryZone: {
          type: 'object',
          properties: {
            lieu: { type: 'string', example: 'Bonanjo' },
            prix: { type: 'string', example: '500', description: 'Prix de livraison, stocké en chaîne.' },
          },
        },
        FastFoodPricing: {
          type: 'object',
          description:
            'Détail du supplément intégré aux prix des menus renvoyés. Le prix affiché vaut ' +
            'prix fastfood + livraison la plus chère + marge plateforme. Le propriétaire de la boutique ' +
            'reçoit les prix RÉELS (`applied: false`), sinon il ne pourrait plus gérer son catalogue.',
          properties: {
            surcharge: { type: 'number', description: 'maxDeliveryPrice + platformMargin.' },
            maxDeliveryPrice: { type: 'number', description: 'Livraison la plus chère de la boutique (0 si pickupOnly).' },
            platformMargin: { type: 'number' },
            applied: { type: 'boolean', description: 'Le supplément est-il inclus dans les prix des menus renvoyés ?' },
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
        // Forme RÉELLE d'un bonus (cf. interface/bonusFields.js). Il n'y a pas
        // de champ `amount` : la valeur d'un bonus tient à son `type`.
        Bonus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', description: 'Chaîne libre : free_delivery, netflix, free_meal, discount…' },
            name: { type: 'string' },
            description: { type: 'string' },
            criteria: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['order_count', 'amount_spent'] },
                target: { type: 'number' },
                period: { type: 'string', enum: ['day', 'week', 'month'] },
              },
            },
            fastFoodId: { type: 'string', nullable: true, description: 'null = bonus plateforme.' },
            fastFoodName: { type: 'string' },
            active: { type: 'boolean' },
            requiresRewardCredentials: { type: 'boolean' },
            requiresProfile: { type: 'boolean' },
            claimDuration: { type: 'number', description: 'Validité du code après réclamation (jours).' },
            usageLimit: { type: 'number' },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
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
    // Absents jusqu'ici : leurs endpoints n'apparaissaient pas dans /api-docs.
    './src/routes/driverRoutes.js',
    './src/routes/ratingRoutes.js',
    './src/routes/walletRoutes.js',
    './src/routes/settingsRoutes.js',
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
