# Architecture — BACKEND (Yaammoo API)

Documentation d'architecture du backend Node.js / Express / Supabase / Socket.io.
(Firebase conservé pour auth, push, storage uniquement.)

> **Convention** : mettre à jour le fichier concerné dès qu'un service/route/controller est modifié.
> Pour la doc frontend, voir [`yaammoo/architecture/README.md`](../../yaammoo/architecture/README.md).

---

## Index des features

### Métier (Features)

| Fichier | Feature | Status |
|---|---|---|
| [users.md](./users.md) | Utilisateurs — registration, auth, profile, **isMarchand recalculé** | ✅ |
| [merchants.md](./merchants.md) | Marchands — creation boutique, config heures livraison | ✅ |
| [menus-detailed.md](./menus-detailed.md) | Menus — catalogue produits, stock, extras, boissons | ✅ |
| [orders.md](./orders.md) | Commandes — routes `/order`, rank queue, stock, transitions statut | ✅ |
| [deliveries.md](./deliveries.md) | Livraisons — tracking, livreur assignation, GPS, statuts | ✅ |
| [payment.md](./payment.md) | Paiements — MobileWallet, `/transaction` → `/pay`, verdict double canal (webhook HTTP + socket), idempotence | ✅ |
| [transactions.md](./transactions.md) | Transactions — historique paiements, portefeuille marchand, remboursements | ✅ |
| [wallet.md](./wallet.md) | Portefeuille marchand — crédit au paiement, solde dérivé, commissions, retraits `/wallet` | ✅ |
| [bonus.md](./bonus.md) | Bonus & Referrals — codes promo, système parrainage, validations | ✅ |
| [notifications.md](./notifications.md) | Notifications — FCM/Expo dispatcher, routes `/notification` | ✅ |
| [socket-events.md](./socket-events.md) | Événements Socket.io — émetteurs, destinataires, rooms | ✅ |
| [auth.md](./auth.md) | Authentification — middleware Bearer, routes `/auth`, Firebase tokens | ✅ |

### Infrastructure (Patterns & Configuration)

| Fichier | Sujet | Status |
|---|---|---|
| [structure.md](./structure.md) | Arborescence `src/` (app, server, routes, controllers, services) | ✅ |
| [validation-errors.md](./validation-errors.md) | Validation données, error handling, HTTP codes, logging | ✅ |
| [config-secrets.md](./config-secrets.md) | Variables d'env, secrets, DB provider router, configuration par env | ✅ |
| [webhooks-integration.md](./webhooks-integration.md) | Webhooks entrants, signature verification, intégrations externes | ✅ |
| [performance-optimization.md](./performance-optimization.md) | N+1 prevention, caching, indexes, pagination, monitoring | ✅ |

---

## Stack

- **Runtime** : Node.js + Express
- **DB** : **Supabase** (PostgreSQL) — couche données pures. Firestore retiré.
- **Auth** : Firebase Auth (`admin.auth()`) — conservé
- **Push** : Dispatcher hybride — `firebase-admin.messaging()` (FCM) + Expo Push API
- **Realtime** : Socket.io (rooms par `userId` et `fastFoodId`)
- **Storage** : Firebase Storage (bucket) + Supabase (images via Multer)
- **Doc API** : Swagger (`/api-docs`)
- **Deploy** : Docker + Fly.io

## Structure racine

```
BACKEND/
├── Dockerfile, fly.toml                # Deploy
├── CLAUDE.md                           # Consignes projet (obligatoire lire avant)
├── architecture/                       # Ce dossier — documentation features
├── src/
│   ├── app.js                          # Express app + montage routes
│   ├── server.js                       # HTTP server + Socket.io
│   ├── socket.js                       # getIO() singleton
│   ├── config/                         # firebase, supabase, multer, swagger, db provider
│   ├── middlewares/                    # authMiddleware (Bearer)
│   ├── routes/                         # Déclaration routes Express
│   ├── controllers/                    # Entrées HTTP (validation → service)
│   ├── services/                       # Logique métier orchestratrice
│   ├── repositories/                   # Accès DB (Supabase, abstrait par mappers)
│   │   ├── supabase/                   # Impl. Supabase (seule impl.)
│   │   ├── index.js                    # Point d'entrée stable repos.*
│   │   └── mappers.js                  # Conversions camelCase ↔ snake_case
│   ├── interface/                      # Définitions champs/schémas
│   └── utils/                          # validator/, helpers, supabaseKeepAlive
└── scripts/                            # Migration, cleanup, etc.
```

## Patterns clés

**Repository Pattern** : Services appellent `repos.users.getById()` → Supabase (impl. unique)  
**Mapper Pattern** : Conversions automatiques camelCase ↔ snake_case en read/write  
**Controller → Service** : Controllers valident + transforment ; Services orchestrent logique métier + appels repo  
**Socket Rooms** : `app:<appId>`, `<userId>` (sans préfixe), `<fastFoodId>` (sans préfixe)
