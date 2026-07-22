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
| [orders.md](./orders.md) | Commandes — routes `/order`, rank queue, stock, transitions statut, **délégation livreur** | ✅ |
| [drivers.md](./drivers.md) | Livreurs — candidatures `/driver`, `user.driverId` vs `order.driverId`, listes | ✅ |
| [deliveries.md](./deliveries.md) | Livraisons — tracking, livreur assignation, GPS, statuts | ✅ |
| [pricing.md](./pricing.md) | **Tarification** — prix affiché calculé (livraison + marge + frais), `settings` modifiables à chaud, `order_settlements` (l'argent) + `order_deliveries` (la course) | ✅ |
| [ratings.md](./ratings.md) | Notes & Avis — table polymorphe `ratings`, note plat/livreur, moyennes pré-calculées | ✅ |
| [payment.md](./payment.md) | Paiements — MobileWallet, `/transaction` → `/pay`, verdict double canal (webhook HTTP + socket), idempotence | ✅ |
| [transactions.md](./transactions.md) | Transactions — historique paiements, portefeuille marchand, remboursements | ✅ |
| [wallet.md](./wallet.md) | Portefeuille marchand — crédit au paiement, solde dérivé, commissions, retraits `/wallet` | ✅ |
| [bonus.md](./bonus.md) | Bonus — fidélité par paliers, `bonusStats` recalculé au GET, livraison manuelle des accès, **livraison offerte : armement + `deliveryOffer`** | ✅ |
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
│   ├── middlewares/                    # authMiddleware (Bearer), optionalAuthMiddleware
│   ├── routes/                         # Déclaration routes Express
│   ├── controllers/                    # Entrées HTTP (validation → service)
│   ├── services/                       # Logique métier orchestratrice
│   ├── repositories/                   # Accès DB (Supabase, abstrait par mappers)
│   │   ├── supabase/                   # Impl. Supabase (seule impl.) — dont settings,
│   │   │                               #   orderSettlements, orderDeliveries
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
**Prix affiché ≠ prix stocké** : le catalogue garde les prix du fastfood ; livraison, marge et frais sont ajoutés **à la lecture**, jamais en base — comme `isMarchand`. Voir [pricing.md](./pricing.md)  
**Réglages métier en base** (`settings`), pas dans `.env` : ils doivent basculer à chaud. Les **seuils de version d'app**, eux, restent en `.env`

---

## Points d'attention connus

| Sujet | À savoir |
|---|---|
| Prix d'un menu | C'est **`prices[]`** (`{price, description}`) qui fait foi. `prix1/prix2/prix3` existent dans le mapper mais sont **NULL sur toute la base** |
| Une commande | = **UN plat** × `quantity`. Un panier de 3 plats = 3 commandes, reliées par `orders.group_id` |
| Zones de livraison | Un même lieu a **deux tarifs** : `periodicZones` et `expressZones`. Toujours filtrer par `orders.delivery.type` |
| Frais de paiement | **Inclus** dans les prix affichés. Aucune ligne de frais n'est jamais présentée au user |
| `platform_revenues` | Table **posée d'avance, pas encore alimentée** — socle pour les revenus hors commandes (flyers, abonnements…) |
| `pickupAllowed` | « le client peut venir récupérer sur place ». **N'exclut pas la livraison** — ex-`pickupOnly`, dont le nom disait l'inverse |
