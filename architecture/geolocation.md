# Géolocalisation — boutiques proches et suivi du livreur

Migration `060_geolocation_tracking.sql`. Deux usages :

1. **Distance des boutiques** au home (`GET /fastfood/all` → `distanceKm`).
2. **Suivi du livreur en course** : position poussée au client en temps réel
   (onglet « Suivi » du détail commande).

La position des utilisateurs (historique) reste dans `user_locations`, voir
[user-location.md](./user-location.md).

## 1. Distance des boutiques

`services/fastfood/fastfoodDistance.js` (`withDistances`), appelé par le
controller de `GET /fastfood/all` sur la page (paginée ou non).

| Point | Source |
|---|---|
| Utilisateur | `?lat=&lng=` si fournis et valides, sinon **dernière ligne** `user_locations` du user connecté (`repos.userLocations.getLatest`) |
| Boutique | `fastfoods.latitude` / `longitude` (posées par le marchand via `POST /fastfood/:id`) |

- `distanceKm` = haversine (`utils/geo.js`), arrondie à 0,1 km ; `null` si
  l'une des deux positions manque (visiteur sans `lat/lng`, boutique sans
  position).
- **Jamais** la position personnelle du propriétaire en repli : elle révélerait
  son domicile et serait fausse hors de la boutique.
- Champ ajouté, ignoré des anciennes apps : R11 ne s'applique pas. Le **tri**
  du home reste `created_at DESC` (curseur) : la distance est affichée, pas
  triée.
- Coût : une lecture d'index `idx_user_locations_user` par page, aucune par
  boutique.

**Position de la boutique** : `latitude` + `longitude` ensemble dans
`POST /fastfood/:fastFoodId` (`updateFastFood.js` : bornes ±90 / ±180, `null`
+ `null` efface). Colonnes réelles (mapper `fastfood`), déclarées dans
`interface/fastfoodFields.js`.

## 2. Suivi du livreur

```
App livreur (tâche arrière-plan, mode livraison, ~10 s)
  └─ POST /driver/location { latitude, longitude, accuracy?, speed?, heading?, capturedAt? }
       ├─ commandes du livreur en `delivering` (orders.driver_id + status)
       │    aucune → 200 { activeDeliveries: 0 } : rien stocké, l'app sort du mode livraison
       ├─ upsert driver_positions (une ligne par livreur, écrasée)
       └─ socket `driverLocationUpdated` → room uid de CHAQUE client concerné
App client (onglet « Suivi »)
  ├─ GET /driver/tracking/:orderId   → état initial (et au retour au premier plan)
  └─ socket `driverLocationUpdated`  → positions suivantes, filtrées sur orderIds
```

### Routes (`routes/driverRoutes.js`, `firebaseAuth`)

| Méthode | Endpoint | Réponse |
|---|---|---|
| POST | `/driver/location` | `200 { data: { activeDeliveries } }` · 400 (payload) |
| GET | `/driver/tracking/:orderId` | `200 { data: { orderId, status, driverId, driver, destination } }` · 403 · 404 |

- `POST /driver/location` : le livreur est celui du Bearer. Payload :
  `interface/driverLocationFields.js`, `validateDriverLocation` (validation
  générique `validateFieldRules`, partagée avec `POST /user/location`).
  `capturedAt` hors [maintenant − 7 j, + 5 min] → heure serveur
  (`resolveCapturedAt`, partagé avec `userLocation.service`).
- `GET /driver/tracking/:orderId` : réservé au **client**, au **livreur** et
  au **propriétaire de la boutique** de la commande. `driver` et `destination`
  ne sont renseignés que pour une commande `delivering` avec un `driverId`.
  `destination` = dernière position connue du client (la commande ne porte
  qu'une adresse texte) ; l'app du client la remplace par sa position live.

### Socket `driverLocationUpdated`

| Destination | Payload |
|---|---|
| room `userId` de chaque client ayant une commande `delivering` du livreur | `{ data: { driverId, latitude, longitude, accuracy, speed, heading, capturedAt, orderIds[] } }` |

**Fire-and-forget** (pas de `reliableEmit`) : une position périmée n'a aucune
valeur, l'ouverture de l'onglet relit l'état par HTTP.

### Table `driver_positions`

```
driver_id   TEXT PK → users(id) ON DELETE CASCADE
latitude, longitude  DOUBLE PRECISION NOT NULL
accuracy, speed, heading  DOUBLE PRECISION
captured_at TIMESTAMPTZ NOT NULL   -- heure du téléphone
updated_at  TIMESTAMPTZ
```

Pas d'historique. Index `idx_orders_driver_status (driver_id, status)` pour la
lecture faite à chaque position (`orders.getLightByDriverAndStatus`, deux
colonnes seulement).

## Fichiers

```
schema/migrations/060_geolocation_tracking.sql
src/utils/geo.js                                   # haversineKm, isValidPoint
src/services/fastfood/fastfoodDistance.js          # withDistances
src/controllers/fastfood/getFastFoods.js           # appel withDistances
src/services/fastfood/updateFastFood.js            # latitude / longitude
src/interface/driverLocationFields.js
src/utils/validator/validateFieldRules.js          # validation générique
src/utils/validator/validateDriverLocation.js
src/repositories/supabase/driverPositions.repo.js  # upsert, getByDriver
src/repositories/supabase/orders.repo.js           # getLightByDriverAndStatus
src/repositories/supabase/userLocations.repo.js    # getLatest
src/services/driver/driverLocation.service.js      # recordDriverPosition, getOrderTracking
src/controllers/driver/driverLocation.controller.js
src/routes/driverRoutes.js                         # POST /location, GET /tracking/:orderId
```

Frontend : `yaammoo/architecture/user-location.md` (mode livraison) et
`yaammoo/architecture/orders-client.md` (onglet « Suivi »).
