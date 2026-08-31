# Architecture — BACKEND (Yaammoo API)

Documentation d'architecture du backend Node.js / Express / Supabase / Socket.io.
(Firebase conservé pour auth, push, storage uniquement.)

> **Convention** : mettre à jour le fichier concerné dès qu'un service/route/controller est modifié.
> Pour la doc frontend, voir [`yaammoo/architecture/README.md`](../../yaammoo/architecture/README.md).

---

## Index des features

### Métier (Features)

| Fichier                                                  | Feature                                                                                                                                                     | Status |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [users.md](./users.md)                                   | Utilisateurs — registration, auth, profile, **isMarchand recalculé**                                                                                        | ✅     |
| [auth-phone.md](./auth-phone.md)                         | **Auth par numéro (Bird)** — OTP WhatsApp/SMS, cooldown facturé, custom token Firebase, suivi des coûts                                                     | ✅     |
| [merchants.md](./merchants.md)                           | Marchands — creation boutique, config heures livraison, **suppression admin (soft delete + purge 30j)**                                                     | ✅     |
| [menus-detailed.md](./menus-detailed.md)                 | Menus — catalogue produits, stock, extras, boissons                                                                                                         | ✅     |
| [orders.md](./orders.md)                                 | Commandes — routes `/order`, rank queue, stock, transitions statut, **délégation livreur**                                                                  | ✅     |
| [drivers.md](./drivers.md)                               | Livreurs — candidatures `/driver`, `user.driverId` vs `order.driverId`, listes                                                                              | ✅     |
| [deliveries.md](./deliveries.md)                         | Livraisons — tracking, livreur assignation, GPS, statuts                                                                                                    | ✅     |
| [pricing.md](./pricing.md)                               | **Tarification (hub)** — composition du prix affiché, **marge par palier**, **la course n'est jamais dans le prix du plat**, `settings` modifiables à chaud | ✅     |
| [pricing-delivery-modes.md](./pricing-delivery-modes.md) | Qui livre (`deliveryBy`), **arrondi au pas dans les deux régimes**, grilles, cascade                                                                        | ✅     |
| [pricing-fees.md](./pricing-fees.md)                     | Les deux frais : commission **agrégateur** (5 %) vs frais de **retrait** MTN/Orange, une ponction par boutique                                              | ✅     |
| [pricing-settlement.md](./pricing-settlement.md)         | Vérité comptable — `order_settlements` (l'argent) + `order_deliveries` (la course), à emporter, déclenchement                                               | ✅     |
| [pricing-roles.md](./pricing-roles.md)                   | Quel prix pour quel rôle — client / livreur / marchand, sockets menu, `rawPrice`                                                                            | ✅     |
| [pricing-margin-risk.md](./pricing-margin-risk.md)       | **Risque de marge** (régime fastfood) — pourquoi le plafond vaut 1400, balayage exhaustif, pertes acceptées, table pour relever le plafond                  | ✅     |
| [pricing-platform-delivery.md](./pricing-platform-delivery.md) | **Régime plateforme** — le fondu, asymétrie fondu/course, bandes de marge, **pourquoi une gratuité n'y coûte rien**, zones express habillées          | ✅     |
| [pricing-free-delivery-cost.md](./pricing-free-delivery-cost.md) | **Coût d'une livraison OFFERTE** — cas dépliés étape par étape, **quand on perd et quand on gagne**, seuils, minimum de plats, où c'est tracé       | ✅     |
| [ratings.md](./ratings.md)                               | Notes & Avis — table polymorphe `ratings`, note plat/livreur, moyennes pré-calculées                                                                        | ✅     |
| [payment.md](./payment.md)                               | Paiements — MobileWallet, `/transaction` → `/pay`, verdict double canal (webhook HTTP + socket), idempotence                                                | ✅     |
| [payment-amount-check.md](./payment-amount-check.md)     | **Contrôle du montant** — recalcul serveur du `total`, livraison offerte (bonus) vs déduction panier groupé                                                 | ✅     |
| [transactions.md](./transactions.md)                     | Transactions — historique paiements, portefeuille marchand, remboursements                                                                                  | ✅     |
| [wallet.md](./wallet.md)                                 | Portefeuille marchand — crédit au paiement, solde dérivé, commissions, retraits `/wallet`                                                                   | ✅     |
| [bonus.md](./bonus.md)                                   | **Bonus (hub)** — fidélité par paliers, modèle de données, routes, `criteria` / `status_view`, une réclamation = une ligne (`is_current`)                   | ✅     |
| [bonus-lifecycle.md](./bonus-lifecycle.md)               | Réclamation, livraison manuelle des accès, `rewardCredentials`, décrément du solde, code & consommation                                                     | ✅     |
| [bonus-delivery-offer.md](./bonus-delivery-offer.md)     | Livraison offerte — armement, consommation à `POST /order`, `deliveryOffer`                                                                                 | ✅     |
| [bonus-definition.md](./bonus-definition.md)             | Validation de la définition, autorisation, résolution de la cible, performance                                                                              | ✅     |
| [notifications.md](./notifications.md)                   | Notifications — FCM/Expo dispatcher, routes `/notification`                                                                                                 | ✅     |
| [support.md](./support.md)                               | Chat support client (fils, messages, socket `support.message`)                                                                                              | ✅     |
| [socket-events.md](./socket-events.md)                   | Événements Socket.io — émetteurs, destinataires, rooms                                                                                                      | ✅     |
| [auth.md](./auth.md)                                     | Authentification — middleware Bearer, routes `/auth`, Firebase tokens                                                                                       | ✅     |
| [banners.md](./banners.md)                                 | **Banners** — carrousel pub du home, table `banners`, CRUD admin, `/banner`, injection dans `/fastfood/all`, réordonnancement auto                       | ✅     |
| [fastfood-pagination.md](./fastfood-pagination.md)         | **`GET /fastfood/all` paginé** — curseur `(created_at, id)`, recherche `?q=`, jointure anti-boutique-vide, rétrocompatibilité                            | ✅     |

### Infrastructure (Patterns & Configuration)

| Fichier                                                      | Sujet                                                               | Status |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------ |
| [structure.md](./structure.md)                               | Arborescence `src/` (app, server, routes, controllers, services)    | ✅     |
| [validation-errors.md](./validation-errors.md)               | Validation données, error handling, HTTP codes, logging             | ✅     |
| [config-secrets.md](./config-secrets.md)                     | Variables d'env, secrets, DB provider router, configuration par env | ✅     |
| [webhooks-integration.md](./webhooks-integration.md)         | Webhooks entrants, signature verification, intégrations externes    | ✅     |
| [performance-optimization.md](./performance-optimization.md) | N+1 prevention, caching, indexes, pagination, monitoring            | ✅     |

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
**Réglages métier en base**, pas dans `.env` : ils doivent basculer à chaud. Répartis par catégorie depuis la migration 046 — `settings_pricing`, `settings_delivery`, `settings_withdrawal`, `settings_deployment`, `settings_auth` (l'ancienne table `settings` unique a été supprimée). La catégorie d'une clé est déclarée dans `KEY_CATEGORY`, jamais déduite de son préfixe. Voir [pricing.md](./pricing.md)  
**Les secrets restent en variable d'environnement** (`.env` en local, secrets Fly en production) : clés d'API, credentials. Aucun secret dans les tables `settings_*`

---

## Points d'attention connus

| Sujet                   | À savoir                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prix d'un menu          | C'est **`prices[]`** (`{price, description}`) qui fait foi. `prix1/prix2/prix3` existent dans le mapper mais sont **NULL sur toute la base**                                                                                                        |
| Une commande            | = **UN plat** × `quantity`. Un panier de 3 plats = 3 commandes, reliées par `orders.group_id`                                                                                                                                                       |
| Zones de livraison      | Un même lieu a **deux tarifs** : `periodicZones` et `expressZones`. Toujours filtrer par `orders.delivery.type`                                                                                                                                     |
| Livraison dans le prix  | Régime **`fastfood`** : le plat ne porte que la **marge** (par palier), calé sur un multiple de 500 vers le haut ; la course s'ajoute au total. Régime **`platform`** : la zone périodique est fondue dans le plat. Voir [pricing.md](./pricing.md) |
| Frais de paiement       | **Inclus** dans les prix affichés. Aucune ligne de frais n'est jamais présentée au user                                                                                                                                                             |
| Les **deux** frais      | `payment_fee_percent` (5 %) = commission de l'**agrégateur** MobileWallet ; `withdrawal_fee_*` = frais de l'**opérateur** MTN/Orange au retrait. Ne pas appeler le premier « commission MTN »                                                       |
| Le résidu de la cascade | C'est **`platform_margin`**, jamais `items_real` : le fastfood touche son prix exact (`rawPrice` figés) dans les deux régimes                                                                                                                       |
| `platform_revenues`     | Table **posée d'avance, pas encore alimentée** — socle pour les revenus hors commandes (flyers, abonnements…)                                                                                                                                       |
| `pickupAllowed`         | « le client peut venir récupérer sur place ». **N'exclut pas la livraison** — ex-`pickupOnly`, dont le nom disait l'inverse                                                                                                                         |
