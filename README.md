# 🍔 Yaammoo Backend - Documentation Complète

> **Plateforme de gestion de commandes de fast-food en temps réel avec notifications en direct**

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Stack technologique](#stack-technologique)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Structure des dossiers](#structure-des-dossiers)
7. [Endpoints API](#endpoints-api)
8. [Modèles de données](#modèles-de-données)
9. [Services et logique métier](#services-et-logique-métier)
10. [Système de notifications](#système-de-notifications)
11. [Déploiement](#déploiement)
12. [Commandes utiles](#commandes-utiles)

---

## 🎯 Vue d'ensemble

**Yaammoo Backend** est une API REST Node.js/Express conçue pour gérer une plateforme complète de commandes de fast-food. Elle offre :

- ✅ **Gestion des menus** : CRUD complet avec validation des images et prix
- ✅ **Gestion des commandes** : Création, mise à jour, suivi en temps réel
- ✅ **Système de notifications** : Socket.io, Firebase Cloud Messaging (FCM), WhatsApp
- ✅ **Gestion des utilisateurs** : Authentification, profils, historique
- ✅ **Gestion des transactions** : Suivi des paiements et bonus
- ✅ **Gestion des fast-foods** : Création et gestion des restaurants
- ✅ **Notifications en temps réel** : Via Socket.io pour les mises à jour instantanées

---

## 🏗️ Architecture

### Pattern MVC (Model-View-Controller)

L'application suit une architecture **MVC modulaire** :

```
src/
├── controllers/     # Gestion des requêtes HTTP
├── services/        # Logique métier
├── routes/          # Définition des endpoints
├── interface/       # Schémas de données (modèles)
├── utils/           # Utilitaires et validateurs
├── middlewares/     # Middlewares Express
├── config/          # Configuration (Firebase, etc.)
└── socket.js        # Configuration Socket.io
```

### Format de réponse standardisé

Tous les services retournent un objet uniforme :

```javascript
{
  success: boolean,      // true si l'opération a réussi
  message: string,       // Message descriptif
  data: object|array|null // Données retournées (null en cas d'échec)
}
```

---

## 🛠️ Stack technologique

| Package | Version | Utilisation |
|---------|---------|-------------|
| **express** | ^5.1.0 | Framework web |
| **firebase-admin** | ^13.2.0 | SDK Firebase côté serveur |
| **@google-cloud/firestore** | ^7.11.1 | Base de données Firestore |
| **socket.io** | ^4.8.1 | Communication en temps réel |
| **cors** | ^2.8.5 | Gestion CORS |
| **multer** | ^1.4.5-lts.2 | Upload de fichiers |
| **twilio** | ^5.5.2 | Envoi de SMS/WhatsApp |
| **dotenv** | ^16.5.0 | Gestion des variables d'environnement |
| **nodemon** | ^3.1.9 | Rechargement automatique (dev) |
| **eslint** | ^9.25.1 | Linting |

**Infrastructure :** Node.js v20.18.0 | Firebase Firestore | Docker | Fly.io

---

## 📦 Installation

### Prérequis

- Node.js v20.18.0 ou supérieur
- npm ou yarn
- Compte Firebase avec Firestore activé
- Clés Twilio (pour SMS/WhatsApp)

### Étapes

```bash
# 1. Cloner le repository
git clone <repository-url>
cd BACKEND

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 4. Lancer le serveur
npm run start:dev  # Mode développement (avec nodemon)
# ou
npm start          # Mode production
```

---

## ⚙️ Configuration

### Variables d'environnement (.env)

```env
# Serveur
PORT=5000
NODE_ENV=production

# Firebase - Option 1 : Via secret JSON
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Firebase - Option 2 : Via variables individuelles
FB_PROJECT_ID=your-project-id
FB_CLIENT_EMAIL=your-client-email@iam.gserviceaccount.com
FB_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FB_UNIVERSE_DOMAIN=googleapis.com

# SSL/TLS (pour gRPC)
SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
SSL_CERT_DIR=/etc/ssl/certs
GRPC_SSL_CIPHER_SUITES=ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS
NODE_TLS_REJECT_UNAUTHORIZED=1

# Twilio (SMS/WhatsApp)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Emulateurs (développement local)
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

---

## 📁 Structure des dossiers

```
src/
├── config/              # Configuration Firebase
├── controllers/         # Gestion des requêtes HTTP
│   ├── auth/
│   ├── user/
│   ├── menu/
│   ├── order/
│   ├── fastfood/
│   ├── transaction/
│   ├── notifications/
│   ├── bonus/
│   ├── bonusRequest/
│   └── images/
├── services/            # Logique métier
│   ├── auth/
│   ├── user/
│   ├── menu/
│   ├── order/
│   ├── fastfood/
│   ├── transaction/
│   ├── notification/
│   ├── bonus/
│   ├── bonusRequest/
│   └── images/
├── routes/              # Définition des endpoints
├── interface/           # Schémas de données
├── utils/               # Validateurs et utilitaires
├── middlewares/         # Middlewares Express
├── app.js               # Configuration Express
├── server.js            # Point d'entrée
└── socket.js            # Configuration Socket.io
```

---

## 🔌 Endpoints API

### Authentification (`/auth`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/signUp` | Créer un nouvel utilisateur |

### Utilisateurs (`/user`, `/users`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/user` | Récupérer tous les utilisateurs |
| GET | `/user/:id` | Récupérer un utilisateur |
| POST | `/user` | Créer un utilisateur (authentifié) |
| PUT | `/user/:id` | Mettre à jour un utilisateur |

### Menus (`/menu`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/menu` | Créer un menu |
| GET | `/menu/:fastFoodId` | Récupérer les menus d'un fast-food |
| PUT | `/menu/:menuId` | Mettre à jour un menu |
| DELETE | `/menu/:menuId` | Supprimer un menu |

### Commandes (`/order`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/order` | Créer une commande |
| GET | `/order/all/:fastFoodId` | Récupérer les commandes d'un fast-food |
| GET | `/order/user/all/:userId` | Récupérer les commandes d'un utilisateur |
| PUT | `/order` | Mettre à jour une commande |
| PUT | `/order/tabs/:userId` | Mettre à jour les onglets de commandes |
| PUT | `/order/update-field` | Mettre à jour un champ sur plusieurs commandes |
| PUT | `/order/update-rank-by-date/:fastFoodId` | Mettre à jour les rangs par date |

### Fast-Foods (`/fastFood`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/fastFood` | Créer un fast-food |
| GET | `/fastFood/all` | Récupérer tous les fast-foods |
| GET | `/fastFood/:id` | Récupérer un fast-food |

### Transactions (`/transaction`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/transaction` | Créer une transaction |
| GET | `/transaction/:userId` | Récupérer les transactions d'un utilisateur |
| GET | `/transaction/:id` | Récupérer une transaction |
| PUT | `/transaction/:id` | Mettre à jour une transaction |

### Notifications (`/notification`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/notification` | Envoyer une notification push (FCM) |
| POST | `/notification/add` | Ajouter une notification en base |
| GET | `/notification/user` | Récupérer les notifications d'un utilisateur |
| GET | `/notification/get` | Récupérer une notification |
| PUT | `/notification/markAsRead` | Marquer comme lue |

### Bonus (`/bonus`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/bonus` | Créer un bonus |
| GET | `/bonus` | Récupérer tous les bonus |

### Demandes de Bonus (`/bonusRequest`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/bonusRequest` | Créer une demande de bonus |
| GET | `/bonusRequest/:userId` | Récupérer le statut des demandes |

### Images (`/image`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/image` | Uploader une image |

### SMS/WhatsApp (`/sms`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/sms` | Envoyer un SMS ou message WhatsApp |

---

## 📊 Modèles de données

### Menu

```javascript
{
  id: string,                          // Auto-généré
  fastFoodId: string,                  // Obligatoire
  name: string,                        // Obligatoire
  createdAt: string,                   // Auto
  updatedAt: string,                   // Auto
  coverImage: string,                  // Obligatoire
  coverImageHasBackground: boolean,    // Obligatoire
  images: string[],                    // Obligatoire
  prices: [                            // Obligatoire
    { price: number, description: string }
  ],
  extra: [                             // Obligatoire
    { name: string, status: boolean }
  ],
  drink: [                             // Obligatoire
    { name: string, status: boolean }
  ],
  status: 'available' | 'unavailable'  // Optionnel
}
```

### Commande

```javascript
{
  id: string,                          // Auto-généré
  userId: string,                      // Obligatoire
  fastFoodId: string,                  // Obligatoire
  clientName: string,                  // Optionnel
  createdAt: string,                   // Auto
  updatedAt: string,                   // Auto
  menu: object,                        // Obligatoire (voir Menu)
  quantity: number,                    // Obligatoire
  total: number,                       // Obligatoire
  userData: {                          // Obligatoire
    firstName: string,
    lastName: string,
    email: string,
    phoneNumber: number,
    photoUrl: string
  },
  extra: [                             // Obligatoire
    { name: string, status: boolean }
  ],
  drink: [                             // Obligatoire
    { name: string, status: boolean }
  ],
  status: 'pending' | 'processing' | 'finished' | 'delivered' | 'canceled',
  delivery: {                          // Obligatoire
    status: boolean,
    date: string,
    type: 'express' | 'time',
    time: string,
    location: string                   // Obligatoire si delivery.status === true
  }
}
```

---

## 🔧 Services et logique métier

### Validation des données

Les services utilisent des validateurs centralisés :

- **validateMenu.js** : Valide les champs d'un menu
- **validateOrder.js** : Valide les champs d'une commande

Options de validation :
- `checkRequired` : Vérifier les champs obligatoires (défaut: true)
- `formatError` : Formater les erreurs (défaut: true)

### Services clés

| Service | Fichier | Fonction |
|---------|---------|----------|
| Menu | `postMenu.service.js` | Créer un menu |
| Menu | `updateMenu.service.js` | Mettre à jour un menu |
| Menu | `deleteMenu.service.js` | Supprimer un menu |
| Commande | `createOrder.js` | Créer une commande |
| Commande | `updateOrders.service.js` | Mettre à jour les commandes |
| Notification | `notificationHandler.js` | Gérer les événements Socket.io |

---

## 📡 Système de notifications

### Socket.io (Temps réel)

Événements émis :
- `newGlobalMenu` : Nouveau menu créé
- `newFastFoodMenu` : Nouveau menu pour un fast-food
- `globalMenuUpdated` : Menu mis à jour
- `fastFoodMenuUpdated` : Menu d'un fast-food mis à jour
- `globalMenuDeleted` : Menu supprimé
- `fastFoodMenuDeleted` : Menu d'un fast-food supprimé

### Firebase Cloud Messaging (FCM)

Envoie des notifications push aux appareils mobiles.

### WhatsApp/SMS (Twilio)

Envoie des messages via Twilio.

---

## 🐳 Déploiement

### Docker

```bash
# Construire l'image
docker build -t yaammoo-backend .

# Lancer le conteneur
docker run -p 5000:3000 --env-file .env yaammoo-backend
```

### Fly.io

```bash
# Déployer
fly deploy

# Vérifier les logs
fly logs
```

Configuration dans `fly.toml`.

---

## 🚀 Commandes utiles

```bash
# Développement
npm run start:dev      # Lancer avec nodemon

# Production
npm start              # Lancer le serveur

# Linting
npm run lint           # Vérifier le code

# Formatage
npm run format         # Formater le code avec Prettier

# Tests
npm test               # Lancer les tests (à configurer)
```

---

## 🔍 Diagnostic Firebase

Accédez à `http://localhost:5000/debug-firebase` pour vérifier la configuration Firebase.

---

## 📝 Notes importantes

1. **Validation stricte** : Tous les champs obligatoires sont validés
2. **Gestion des erreurs** : Format de réponse uniforme avec codes HTTP appropriés
3. **Notifications en temps réel** : Socket.io pour les mises à jour instantanées
4. **Sécurité** : Authentification Firebase, CORS configuré
5. **Modularité** : Architecture MVC pour faciliter la maintenance

---

## 📞 Support

Pour toute question ou problème, consultez la documentation Firebase ou contactez l'équipe de développement.

**Dernière mise à jour** : 17 Janvier 2025
