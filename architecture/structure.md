# Structure globale — BACKEND/src

## Arborescence

```
src/
├── app.js                     # Express : middlewares CORS/JSON + monte toutes les routes
├── server.js                  # http.createServer(app) + initialise Socket.io
├── socket.js                  # export getIO() — singleton
│
├── config/
│   ├── firebase.js            # init firebase-admin + export { db, admin }
│   ├── multer.js              # multer memory storage (upload images)
│   ├── swagger.js             # swagger-jsdoc config
│   └── serviceAccountKey.js   # clé service Firebase (ne pas commit)
│
├── middlewares/
│   └── authMiddleware.js      # vérifie Bearer token Firebase → req.user
│
├── routes/                    # un fichier par feature, monté dans app.js
│   ├── authRoutes.js          → /auth
│   ├── userRoutes.js          → /user
│   ├── fastfoodRoutes.js      → /fastfood
│   ├── menuRoutes.js          → /menu
│   ├── orderRoutes.js         → /order
│   ├── notificationRoutes.js  → /notification
│   ├── transactionRoutes.js   → /transaction
│   ├── bonusRoute.js          → /bonus
│   ├── bonusRequestRoute.js   → /bonusRequest
│   ├── imageRoutes.js         → /image
│   ├── smsRoutes.js           → /sms (WhatsApp)
│   ├── supportRoutes.js       → /support (chat support client/marchand)
│   └── paymentPageRoutes.js   → /payment-page (page HTML paiement, WebView app)
│
├── controllers/               # HTTP → service
│   ├── auth/
│   ├── bonus/ bonusRequest/
│   ├── fastfood/
│   ├── images/
│   ├── menu/
│   ├── notifications/
│   │   ├── request/           # postNotification, getNotifications, markAsRead…
│   │   ├── FCM/               # sendPushNotification.controller
│   │   └── whatsapp/
│   ├── order/
│   ├── support/               # threads, messages, markRead
│   ├── transaction/
│   └── user/
│
├── services/                  # Logique métier
│   ├── auth/
│   ├── bonus/ bonusRequest/
│   ├── fastfood/
│   ├── images/                # upload Supabase
│   ├── menu/
│   ├── notification/
│   │   ├── request/           # postNotification.service, get, markAsRead
│   │   ├── FCM/               # sendPushNotification (dispatcher), sendExpoPushNotification
│   │   ├── helpers/           # notifyOrderEvent, cleanStaleTokens, getUserTokens
│   │   ├── socket/            # helpers d'émission socket
│   │   └── whatsapp/
│   ├── order/                 # createOrder, updateOrders, rankQueue…
│   ├── support/               # fils + messages, emitSupportMessage, notifySupportMessage
│   ├── transaction/
│   └── user/                  # userService (fcmTokens arrayUnion)
│
├── interface/                 # Définitions champs Firestore (schemas logiques)
│
│   (hors src/) public/payment/index.html  # Page servie par /payment-page
│
└── utils/
    ├── validator/             # validateOrder, validateNotificationData, validateUser…
    ├── flattenNotifications.js
    └── supabaseKeepAlive.js
```

---

## Montage des routes (app.js)

```js
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/fastfood', fastfoodRoutes);
app.use('/menu', menuRoutes);
app.use('/order', orderRoutes);
app.use('/notification', notificationRoutes);
app.use('/transaction', transactionRoutes);
app.use('/bonus', bonusRoutes);
app.use('/bonusRequest', bonusRequestRoutes);
app.use('/image', imageRoutes);
app.use('/sms', smsRoutes);
app.use('/support', supportRoutes);
app.use('/payment-page', paymentPageRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

## Convention des couches

| Couche                      | Responsabilité                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| **route**                   | Déclare path + verbe + swagger doc, pointe sur 1 controller                               |
| **controller**              | Parse `req`, vérifie présence des params, appelle service, retourne `res.status().json()` |
| **service**                 | Logique métier : Firestore, socket, push, transactions                                    |
| **helpers** (dans services) | Fonctions partagées entre services (ex: `notifyOrderEvent`)                               |
| **utils/validator**         | Fonctions pures → retournent `errors[]`                                                   |
