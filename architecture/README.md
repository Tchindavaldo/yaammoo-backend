# Architecture — BACKEND (Yaammoo API)

Documentation d'architecture du backend Node.js / Express / Firestore-Supabase / Socket.io.

> **Convention** : mettre à jour le fichier concerné dès qu'un service/route/controller est modifié.
> Pour la doc frontend, voir [`yaammoo/architecture/README.md`](../../yaammoo/architecture/README.md).

---

## Index des features

| Fichier | Feature | Status |
|---|---|---|
| [structure.md](./structure.md) | Arborescence globale `src/` (app, server, routes, controllers, services) | ✅ Existant |
| [users.md](./users.md) | Utilisateurs — registration, auth, profile, **isMarchand logic recalculé** | ✅ Nouveau |
| [merchants.md](./merchants.md) | Marchands — creation boutique, gestion menus/commandes | ✅ Nouveau |
| [orders.md](./orders.md) | Commandes — routes `/order`, rank queue, stock, transitions de statut | ✅ Existant |
| [payment.md](./payment.md) | Paiements — MobileWallet, routes `/payment`, webhook, numéro paiement | ✅ Nouveau |
| [notifications.md](./notifications.md) | Notifications — FCM/Expo dispatcher, routes `/notification`, service | ✅ Existant |
| [socket-events.md](./socket-events.md) | Événements Socket.io — émetteurs, destinataires, payloads, rooms | ✅ Existant |
| [auth.md](./auth.md) | Authentification — middleware Bearer, routes `/auth`, Firebase tokens | ✅ Existant |

---

## Stack

- **Runtime** : Node.js + Express
- **DB** : Firestore (Firebase) — migrable vers Supabase via mappers
- **DB Supabase** : Alternative complète avec mismo mapper pattern
- **Push** : Dispatcher hybride — `firebase-admin.messaging()` (FCM) + Expo Push API
- **Realtime** : Socket.io (rooms par `userId` et `fastFoodId`)
- **Storage** : Supabase (images via Multer)
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
│   ├── repositories/                   # Accès DB (Firestore/Supabase abstrait par mappers)
│   │   ├── firestore/                  # Impl. Firestore
│   │   ├── supabase/                   # Impl. Supabase
│   │   ├── index.js                    # Router vers bonne impl. (DB_PROVIDER)
│   │   └── mappers.js                  # Conversions Firestore ↔ Supabase
│   ├── interface/                      # Définitions champs/schémas
│   └── utils/                          # validator/, helpers, supabaseKeepAlive
└── scripts/                            # Migration, cleanup, etc.
```

## Patterns clés

**Repository Pattern** : Services appellent `repos.users.getById()` → router vers Firestore/Supabase selon `DB_PROVIDER`  
**Mapper Pattern** : Conversions automatiques Firestore ↔ Supabase en read/write  
**Controller → Service** : Controllers valident + transforment ; Services orchestrent logique métier + appels repo  
**Socket Rooms** : `app:<appId>`, `user:<userId>`, `fastfood:<fastFoodId>`
