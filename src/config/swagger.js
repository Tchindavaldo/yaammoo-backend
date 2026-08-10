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
        // Forme RÉELLE d'un menu (cf. interface/menuFields.js). Les prix vivent
        // dans `prices[]` : les colonnes prix1/prix2/prix3 du mapper sont NULL
        // sur toute la base. `rawPrice` accompagne chaque prix affiché.
        Menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fastFoodId: { type: 'string' },
            name: { type: 'string' },
            coverImage: { type: 'string' },
            coverImageHasBackground: { type: 'boolean' },
            images: { type: 'array', items: { type: 'string' } },
            prices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  price: { type: 'number', description: 'Prix AFFICHÉ (livraison + marge + frais inclus).' },
                  rawPrice: {
                    type: 'number',
                    description: 'Prix RÉEL du fastfood, servi à côté de l\'affiché. À renvoyer tel quel dans la commande : il fige le prix de l\'époque pour la vue marchand.',
                  },
                  description: { type: 'string' },
                },
              },
            },
            extra: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'boolean' },
                  prix: { type: 'number' },
                  rawPrice: { type: 'number' },
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
                  prix: { type: 'number' },
                  rawPrice: { type: 'number' },
                  quantite: { type: 'number' },
                },
              },
            },
            status: { type: 'string', enum: ['available', 'unavailable'] },
            stock: { type: 'number' },
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
              description: 'Index (base 1) du prix retenu dans `menu.prices[]`.',
            },
            withdrawalFee: {
              type: 'number',
              description:
                "Vue MARCHAND : cout du retrait de cet argent chez l'operateur. UNE ponction par panier ET par boutique — renseigne sur une seule commande du groupe (`withdrawalFeeBilled: true`), 0 sur les autres.",
            },
            withdrawalGroupId: {
              type: 'string',
              nullable: true,
              description: 'Vue MARCHAND : relie les commandes partageant une meme ponction de retrait. Pendant de `deliveryGroupId` pour la course.',
            },
            withdrawalFeeBilled: {
              type: 'boolean',
              description: 'Vue MARCHAND : true sur la commande qui porte la ponction de retrait du groupe. Leve toute ambiguite sur un `withdrawalFee` a 0.',
            },
            customerTotal: {
              type: 'number',
              description:
                'Vue MARCHAND uniquement (GET /order/all/:fastFoodId et events marchand) : ce que le CLIENT a payé. Sur ces réponses, `total` vaut ce que le marchand encaisse et les prix des lignes sont les prix réels. Client et livreur ne reçoivent pas ce champ.',
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
            total: {
              type: 'number',
              description:
                'Montant de la commande. Client et livreur : ce qui a été PAYÉ. Marchand (GET /order/all/:fastFoodId et events marchand) : ce qu\'il ENCAISSE — voir `customerTotal` pour le montant client.',
            },
            status: {
              type: 'string',
              enum: ['pendingToBuy', 'pending', 'processing', 'finished', 'delivering', 'delivered', 'cancelByUser', 'cancelByFastFood'],
            },
            rank: { type: 'number', description: 'Rang dans la file du fastfood pour (statut, date de livraison).' },
            clientId: { type: 'string' },
            periodKey: { type: 'string' },
            groupId: {
              type: 'string',
              nullable: true,
              description: "Commandes d'un même panier, à réafficher ensemble (une commande = un plat). " + 'Renseigné par le backend au passage en `pending`, jamais envoyé par le client.',
            },
            driverId: { type: 'string', nullable: true, description: 'Livreur assigné à CETTE commande.' },
            deliveryGroupId: {
              type: 'string',
              description:
                "Commandes du même panier ET de la même boutique, qui ne valent qu'UNE seule course. " +
                "À distinguer de `groupId`, qui groupe le panier entier (il peut couvrir deux boutiques). " +
                "Absent si la commande est à emporter (pas de course).",
            },
            courseBilled: {
              type: 'boolean',
              description:
                'true sur UNE SEULE commande du `deliveryGroupId` : celle qui porte réellement la course. ' +
                'Les autres valent `false` — leur livraison est payée par celle-là. Absent si la commande est à emporter.',
            },
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
          description: "Offre de livraison applicable. Porte des DONNÉES, pas une consigne d'affichage : le front décide seul du rendu. " + "`null` quand aucune offre ne s'applique, ou quand l'appelant n'est pas authentifié.",
          properties: {
            active: { type: 'boolean' },
            reason: {
              type: 'string',
              enum: ['bonus', 'campaign'],
              description: '`bonus` = bonus du user ; `campaign` = mode gratuité globale plateforme.',
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
            minItems: {
              type: 'integer',
              description:
                "Plats minimum sur le DEPART (meme boutique, meme zone, meme creneau) pour que la gratuite s'applique. " +
                "Vaut 2 en regime 'platform' (seuil fixe, connu sans contexte). Vaut 0 en regime 'fastfood' : le seuil y depend de la zone et du prix du plat, " +
                'et se calcule via POST /bonus/verify en fournissant le contexte de commande. ' +
                "Indispensable pour la CAMPAGNE globale, qui ne passe jamais par /bonus/verify : sans ce champ le front ne pourrait pas annoncer le minimum avant le paiement. " +
                'En dessous du seuil, POST /transaction refuse en 400.',
            },
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
            pickupAllowed: { type: 'boolean', description: "true = le user peut venir récupérer sur place. N'exclut PAS la livraison." },
            deliveryBy: {
              type: 'string',
              enum: ['fastfood', 'platform'],
              description:
                "Qui livre cette boutique — decide par l'ADMIN, jamais par le marchand. 'fastfood' : zones de la boutique, prix exact, course versee au marchand. 'platform' : zones de `platformDeliveryZones`, prix cale sur un multiple de `price_rounding_step`, course versee au livreur.",
            },
            platformDeliveryZones: {
              type: 'array',
              description:
                "Zones de livraison de la PLATEFORME. Meme forme que `deliveryHours` (periodicZones ET expressZones par creneau). Utilisees seulement quand deliveryBy = 'platform'. " +
                'EN LECTURE, les zones `expressZones` sont renvoyees TARIFEES : `prix` porte la commission et les frais de retrait puis est arrondi au pas ' +
                '(`express_price_rounding_step`, toujours vers le haut), et `rawPrice` conserve le montant brut verse au livreur — meme convention que les extras et boissons. ' +
                'Les `periodicZones` restent BRUTES : elles sont deja fondues dans le prix du plat. Le front doit renvoyer `rawPrice` dans la commande.',
              items: { type: 'object' },
            },
            cities: { type: 'array', items: { type: 'string' } },
            deliveryHours: {
              type: 'array',
              description: 'Créneaux de livraison avec zones et prix. Deux formats coexistent selon la version du client ' + '(cf. utils/deliveryHoursFormat.js) : legacy = tableau de "HH:mm", actuel = tableau d\'objets.',
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
            maxDeliveryPrice: { type: 'number', description: 'Livraison la plus chère de la boutique (0 si aucune zone déclarée).' },
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
                kind: { type: 'string', enum: ['order_count', 'amount_spent', 'status_view'] },
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
