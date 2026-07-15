# Feature — Drivers (Livreurs)

Système de livreurs délégués : un user postule auprès d'un fastFood, le fastFood
accepte/refuse, puis assigne des commandes à ses livreurs.

> Le côté **assignation de commande + progression de statut** est documenté dans
> [orders.md](./orders.md) (section « Délégation à un livreur »). Ce fichier couvre
> le **cycle de candidature** et le modèle `driverId`.

---

## `driverId` : un marqueur, pas une relation boutique

Un livreur peut servir **plusieurs** boutiques. L'appartenance boutique↔livreur
n'est donc PAS portée par `driverId` mais par les lignes `driver_applications`
en status `accepted`.

| Champ | Valeur | Sens | Stockage |
|---|---|---|---|
| `user.driverId` | **son propre `uid`** | Marqueur : le user est livreur. Le front dérive `isDriver = !!driverId`. | `users.extra_data->>driverId` (pass-through mapper, pas de colonne) |
| `order.driverId` | `uid` du livreur | Le livreur **assigné à cette commande**. | colonne `orders.driver_id` (migration 009) |

> `user.driverId` et `order.driverId` valent donc le **même uid** pour un livreur donné :
> le fastFood assigne `order.driverId = user.driverId`.

- **Livreurs d'une boutique** : `driver_applications` où `fastfood_id = X` et `status = accepted`.
- **Boutiques d'un livreur** : `driver_applications` où `user_id = driverId` et `status = accepted`.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---|---|---|---|
| POST | `/driver/apply` | `apply` | Un user postule (`{ userId, fastFoodIds[] }`) → une demande `pending` par boutique |
| GET | `/driver/applications/:fastFoodId` | `getApplicationsController` | Candidatures reçues par le fastFood (avec infos candidat) |
| GET | `/driver/list/:fastFoodId` | `getDriversController` | Livreurs `accepted` du fastFood (`DriverInfo[]`) |
| GET | `/driver/stores/:driverId` | `getStoresController` | Boutiques servies par le livreur (`StoreOption[]` `{id, nom}`) |
| GET | `/driver/my-applications/:userId` | `getMyApplicationsController` | Demandes envoyées par le user (+ `fastFoodName`, `status`). Relance = re-POST `/driver/apply` |
| PUT | `/driver/applications/:applicationId` | `decide` | `{ decision: accepted \| refused }` |
| DELETE | `/driver/:driverId?fastFoodId=` | `removeDriverController` | Retire le livreur de la boutique (vide `user.driverId` s'il ne sert plus aucune boutique) |
| POST | `/driver/:driverId/rating` | `rateDriverController` | Noter un livreur (client livré) — voir [ratings.md](./ratings.md) |
| GET | `/driver/:driverId/ratings` | `getDriverRatingsController` | Liste des avis d'un livreur |
| GET | `/driver/:driverId` | `getDriverProfileController` | **Infos livreur, contenu adapté au demandeur** (protégé `firebaseAuth`) |

### `GET /driver/:driverId` — profil adapté au demandeur

`services/driver/getDriverProfile.service.js`. Le contenu dépend de `req.user.uid` :

| Demandeur | `scope` | Contenu |
|---|---|---|
| Simple user (autre) | `public` | `uid`, `isDriver`, `nom`/`prenom` (**fallback** partie locale de l'email si vides), `displayName`, `photo` (pass-through `extra_data`), `ratingAvg`/`ratingCount`, `stores[]`, **`myStats`** (ses commandes avec CE livreur : `{delivered,inProgress,pending,total}`), **`hasRated`**, **`canRate`** (livré ≥1 fois ET pas encore noté) |
| Marchand possédant ce livreur (`accepted`) | `merchant` | idem + `fastFoodId` + `stats` **pour SA boutique** : `{ delivered, inProgress, pending, total }` |
| Le livreur lui-même | `self` | idem + `stats` **globales** (toutes boutiques) |

- Buckets statuts : `delivered` (terminées) ; `processing|finished|delivering` (en cours) ;
  `pending|pendingToBuy` (en attente).
- **Jamais** d'email/password/pushTokens bruts exposés — l'email sert seulement de fallback d'affichage du nom.
- 404 si le user n'existe pas ou n'est pas livreur (`!user.driverId`).

> **Notes livreur** : le user (livreur) porte `driverRatingAvg` + `driverRatingCount`
> (pré-calculés, colonnes `users.driver_rating_avg/count`). Détail : [ratings.md](./ratings.md).

Montées dans `app.js` sous `/driver`. Recherche boutique (« Devenir livreur ») :
`GET /fastFood/search?q=` → `StoreOption[]` `{ id, nom }` (`fastfoods.searchByName`, `ilike`).

---

## Table `driver_applications` (migration `010_driver_applications.sql`)

```
id           TEXT PK
user_id      TEXT       -- candidat
fastfood_id  TEXT       -- fastFood visé
status       TEXT       -- pending | accepted | refused
extra_data   JSONB
created_at / updated_at
```

Index : `(fastfood_id, created_at DESC)`, `(user_id)`, et
`users((extra_data->>'driverId'))` pour `GET /driver/list`.

---

## Service — `services/driver/driverApplication.service.js`

- **`applyAsDriver({ userId, fastFoodIds })`** : **idempotent par couple
  `(userId, fastFoodId)`** — au plus une ligne par boutique :
  - aucune ligne → crée `pending` (→ `created[]`) ;
  - ligne `refused` → « Relancer » = repasse la MÊME ligne à `pending` (→ `reactivated[]`) ;
  - ligne `pending`/`accepted` → inchangée (→ `skipped[]`) ;
  - boutique inexistante → `skipped[]`.
  `409` si `created + reactivated == 0`. Retourne `data = { created[], reactivated[], skipped[] }`.
- **`getApplications(fastFoodId)`** : demandes du fastFood, enrichies de `user`
  (`{ uid, infos, driverId, isDriver }`).
- **`getDrivers(fastFoodId)`** : demandes `accepted` du fastFood → infos livreurs.
- **`getStores(driverId)`** : demandes `accepted` du user → `StoreOption[]` `{id, nom}`.
- **`decideApplication(applicationId, decision)`** :
  - `accepted` → `repos.users.updateUser(userId, { driverId: userId })` (marqueur
    `isDriver`, idempotent) + demande passée à `accepted`.
  - `refused` → demande passée à `refused`.
  - Refuse si demande déjà traitée (`409`).

---

## Events + notifications

- **Création** (`apply`) → marchand de chaque boutique : socket `driverApplicationCreated`
  `{ data: application }` + push + notif BD (via `notifyOrderEvent`).
- **Décision** (`decide`) → candidat : socket `driverApplicationDecided` `{ data: application }`
  + push + notif BD.
- Rooms = `userId` (marchand / candidat), rejointes via `join_user` (pas de room dédiée).

## Codes d'erreur

- `400` : champ requis manquant / décision invalide
- `404` : user, fastFood ou demande introuvable
- `409` : déjà livreur, demande déjà en attente, ou demande déjà traitée
