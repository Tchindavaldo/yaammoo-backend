# Architecture — BACKEND (Yaammoo API)

Documentation d'architecture du backend Node.js / Express / Firestore / Socket.io.

> **Convention** : mettre à jour le fichier concerné dès qu'un service/route/controller est modifié.

---

## Index

| Fichier | Feature |
|---|---|
| [structure.md](./structure.md) | Arborescence globale `src/` (app, server, routes, controllers, services) |
| [orders.md](./orders.md) | Commandes — routes `/order`, rank queue, stock, transitions de statut |
| [notifications.md](./notifications.md) | Notifications — FCM/Expo dispatcher, routes `/notification`, service, helpers |
| [socket-events.md](./socket-events.md) | Événements Socket.io — émetteurs, destinataires, payloads, rooms |
| [auth.md](./auth.md) | Authentification — middleware Bearer, routes `/auth`, `/user` |

---

## Stack

- **Runtime** : Node.js + Express
- **DB** : Firebase Firestore (via `firebase-admin`)
- **Push** : Dispatcher hybride — `firebase-admin.messaging()` (FCM natif) + Expo Push API
- **Realtime** : Socket.io (rooms par `userId`)
- **Storage** : Supabase (images via Multer)
- **Doc API** : Swagger (`/api-docs`)
- **Deploy** : Docker + Fly.io (`fly.toml`)

## Structure racine

```
BACKEND/
├── Dockerfile, fly.toml       # Deploy
├── src/
│   ├── app.js                 # Express app + montage des routes
│   ├── server.js              # HTTP server + Socket.io init
│   ├── socket.js              # getIO() singleton
│   ├── config/                # firebase, multer, swagger, serviceAccountKey
│   ├── middlewares/           # authMiddleware (Bearer)
│   ├── routes/                # Déclaration des routes Express
│   ├── controllers/           # Entrées HTTP (validation → service)
│   ├── services/              # Logique métier
│   ├── interface/             # Définitions champs Firestore
│   └── utils/                 # validator/, flattenNotifications, supabaseKeepAlive
└── architecture/              # Ce dossier
```
