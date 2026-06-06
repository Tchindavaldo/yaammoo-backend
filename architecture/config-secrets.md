# Infrastructure — Configuration & Secrets

## Rôle

Gestion centralisée configuration, variables d'environnement, secrets (clés API, credentials DB).

---

## Configuration Files

### `src/config/` Directory

| Fichier | Rôle |
|---------|------|
| `firebase.js` | Init Firebase Admin SDK |
| `supabase.js` | Init Supabase client |
| `dbProvider.js` | Router DB_PROVIDER (Firestore vs Supabase) |
| `swagger.js` | Config Swagger/OpenAPI |
| `multer.js` | Upload fichiers (image) |
| `serviceAccountKey.js` | Charger Firebase service account |

### `.env` (gitignoré)

```bash
# Database Provider
DB_PROVIDER=firestore                    # ou 'supabase'

# Firebase (Firestore)
FIREBASE_PROJECT_ID=yaammoo-prod
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@...
FIREBASE_DATABASE_URL=https://yaammoo-prod.firebaseio.com

# Supabase (alternative)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...

# Payments
MOBILEWALLET_URL=https://api.mobilewallet.com
MOBILEWALLET_API_KEY=sk_live_xxxx...
MOBILEWALLET_WEBHOOK_SECRET=whsec_xxxx...

# Push Notifications
FCM_PROJECT_ID=yaammoo-fcm
EXPO_ACCESS_TOKEN=ExponentPushToken[xxx]

# Server
NODE_ENV=production                      # ou 'development'
PORT=3000
API_URL=https://api.yaammoo.com

# Logging & Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
LOG_LEVEL=info                           # debug, info, warn, error

# Optional: Redis (caching future)
REDIS_URL=redis://localhost:6379
```

---

## Database Provider Pattern

### `src/config/dbProvider.js`

```javascript
const DB_PROVIDER = process.env.DB_PROVIDER || 'firestore';

console.log(`[dbProvider] mode=${DB_PROVIDER}`);

module.exports = {
  getProvider: () => DB_PROVIDER,
  isFirestore: () => DB_PROVIDER === 'firestore',
  isSupabase: () => DB_PROVIDER === 'supabase'
};
```

### `src/repositories/index.js` (Router)

```javascript
const dbProvider = require('../config/dbProvider');

let users, fastfoods, menus, orders, transactions, notifications, bonus;

if (dbProvider.isFirestore()) {
  users = require('./firestore/users.repo');
  fastfoods = require('./firestore/fastfoods.repo');
  // ... etc
} else if (dbProvider.isSupabase()) {
  users = require('./supabase/users.repo');
  fastfoods = require('./supabase/fastfoods.repo');
  // ... etc
} else {
  throw new Error(`Unknown DB_PROVIDER: ${dbProvider.getProvider()}`);
}

module.exports = {
  users,
  fastfoods,
  menus,
  orders,
  transactions,
  notifications,
  bonus
};
```

**Result** : Services ne connaissent PAS la DB utilisée. Simple env var switch.

---

## Firebase Config

### `src/config/firebase.js`

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey');

const db = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
}).firestore();

module.exports = { db, admin };
```

### `src/config/serviceAccountKey.js`

```javascript
// Charge depuis env var (base64 encoded JSON)
const key = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_KEY || '{}', 'base64').toString()
);

module.exports = key;
```

**Alternative** : Fichier `secrets/serviceAccountKey.json` (gitignoré, chargé en prod via secret manager).

---

## Supabase Config

### `src/config/supabase.js`

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Service role (admin access)
);

module.exports = { supabase };
```

---

## Secrets Management (Production)

### Fly.io Secrets

```bash
# Set secret
fly secrets set MOBILEWALLET_API_KEY=sk_live_xxxx...

# List secrets
fly secrets list

# Remove secret
fly secrets unset MOBILEWALLET_API_KEY
```

### Docker secrets (Kubernetes-style)

```dockerfile
# In Dockerfile
RUN --mount=type=secret,id=firebase_key \
    cat /run/secrets/firebase_key > /app/secrets/serviceAccountKey.json
```

### Alternative: AWS Secrets Manager / HashiCorp Vault

(Future enhancement)

---

## Configuration per environment

### Development

```bash
DB_PROVIDER=firestore
NODE_ENV=development
LOG_LEVEL=debug
# Local Firebase emulator
FIREBASE_EMULATOR_HOST=localhost:8080
```

### Staging

```bash
DB_PROVIDER=firestore
NODE_ENV=staging
LOG_LEVEL=info
# Real Firebase staging project
FIREBASE_PROJECT_ID=yaammoo-staging
```

### Production

```bash
DB_PROVIDER=supabase  # Ou firestore prod
NODE_ENV=production
LOG_LEVEL=warn
# Production credentials from secret manager
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

---

## Swagger Config

### `src/config/swagger.js`

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Yaammoo API',
      version: '1.0.0',
      description: 'Backend API pour app yaammoo'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'API server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']  // Swagger comments in routes
};

const specs = swaggerJsdoc(options);
module.exports = specs;
```

---

## Environment Validation

### On startup

```javascript
// src/server.js
const requiredEnvVars = [
  'NODE_ENV',
  'DB_PROVIDER',
  'API_URL'
];

const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`✅ All required env vars present`);
```

---

## Checklist

Before deploy:

- [ ] `.env` is .gitignored
- [ ] All `.env` vars are documented (in README or here)
- [ ] Secrets stored in secret manager (not in repo)
- [ ] DB_PROVIDER matches deployment (firestore vs supabase)
- [ ] API_URL is correct (prod domain)
- [ ] LOG_LEVEL is appropriate (warn for prod)
- [ ] Firebase/Supabase credentials are valid
- [ ] MobileWallet credentials are correct
- [ ] Webhook secrets are in sync with provider
