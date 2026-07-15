# Feature — Ratings (Notes & Avis)

Système de notation **polymorphe** : les clients notent un **plat** (`menu`) ou un
**livreur** (`driver`), avec valeur 1-5 + commentaire. Extensible à d'autres cibles
(`target_type`) sans nouvelle table.

---

## Table `ratings` (migration `011_ratings.sql`)

Une **seule** table pour toutes les notes. Chaque note garde son **contexte**.

```
id           TEXT PK
target_type  TEXT        -- 'menu' | 'driver' | … (extensible)
target_id    TEXT        -- id du plat OU uid du livreur
user_id      TEXT        -- auteur de la note
order_id     TEXT        -- commande liée (preuve + contexte)
value        INTEGER     -- 1..5 (CHECK)
comment      TEXT
extra_data   JSONB       -- contexte riche (fastFoodId, heure/durée livraison, zone…)
created_at / updated_at
```

- **UNIQUE `(target_type, target_id, user_id)`** → une note par (user, cible) ; re-noter = **upsert**.
- Index `(target_type, target_id, created_at DESC)` → liste des avis d'une cible.

### Moyennes pré-calculées (lecture instantanée)

Jamais recalculées en lisant toutes les lignes : mises à jour de façon
**incrémentale et atomique** dans la fonction SQL `rate_target()`.

| Cible | Colonnes moyenne | Exposées par |
|---|---|---|
| plat (`menu`) | `menus.rating_avg`, `menus.rating_count` | mapper menu → `ratingAvg`, `ratingCount` |
| livreur (`driver`) | `users.driver_rating_avg`, `users.driver_rating_count` | mapper user → `driverRatingAvg`, `driverRatingCount` |
| fastFood-livreur (`fastfoodDriver`) | `fastfoods.driver_rating_avg`, `fastfoods.driver_rating_count` | mapper fastfood → `driverRatingAvg`, `driverRatingCount` |

Le catalogue (`GET /menu/:fastFoodId`) et le profil livreur portent donc déjà la
moyenne — **aucune requête d'agrégat** au chargement.

### Fonction SQL `rate_target(...)`

Upsert + recalcul en **une transaction** (verrous `FOR UPDATE` → pas de race) :

- **nouvelle note** : `avg = (avg*count + value) / (count+1)` ; `count += 1`.
- **re-note** : `avg = (avg*count - oldValue + value) / count` ; `count` inchangé.

Route vers `menus` (`menu`), `fastfoods` (`fastfoodDriver`) ou `users` (`driver`) selon `target_type`. Renvoie la note + `rating_avg`/`rating_count` à jour.

---

## Routes

| Méthode | Endpoint | Auth | Rôle |
|---|---|---|---|
| POST | `/menu/:menuId/rating` | ✅ `firebaseAuth` | Noter un plat (`{ orderId, value, comment? }`) |
| GET | `/menu/:menuId/ratings` | public | Liste des avis d'un plat |
| POST | `/driver/:driverId/rating` | ✅ `firebaseAuth` | Noter un livreur (`{ orderId, value, comment? }`) |
| GET | `/driver/:driverId/ratings` | public | Liste des avis d'un livreur |
| GET | `/fastFood/:fastFoodId/delivery-stats` | ✅ `firebaseAuth` | Stats auto-livraison du fastFood (scope `self`/`client`) |
| GET | `/menu/:menuId/stats` | ✅ `firebaseAuth` | Stats de commande d'un plat (scope `self`/`client`) |
| GET | `/rating/order/:orderId` | ✅ `firebaseAuth` | Note (menu + livreur) laissée par l'user pour sa commande |

> `value` : entier 1-5. L'`uid` de l'auteur vient du token (`req.user.uid`), **jamais du body**.

---

## Garde métier (non contournable — le backend NE fait PAS confiance au front)

Le front envoie l'`orderId` ; le backend lit la commande et vérifie **lui-même** :

**Note plat** (`services/rating/rateMenu.service.js`) :
1. commande existe → sinon `404`
2. `order.userId === uid` → sinon `403`
3. `order.status === 'delivered'` → sinon `403`
4. `order.menu.id === menuId` (la commande contient ce plat) → sinon `403`

**Note livreur** (`services/rating/rateDriver.service.js`) :
1-3. idem (existe / à ce user / delivered)
4. `order.driverId === driverId` (livrée par ce livreur) → sinon `403`

---

## Sockets (moyenne à jour diffusée en direct, via `reliableEmit`)

| Event | Destinataires | Payload |
|---|---|---|
| `menuRatingUpdated` | **marchand** (`fastfoods.userId`) + **user** auteur | `{ data: { menuId, ratingAvg, ratingCount, value } }` |
| `driverRatingUpdated` | **livreur** (`driverId`) + **user** auteur + **marchand** | `{ data: { driverId, ratingAvg, ratingCount, value } }` |

- Fiabilisés (outbox + rejeu) : le front doit gérer `__eventId` (dédoublonnage) + appeler l'ACK.
- Le front met à jour la moyenne affichée **directement** avec le payload (pas de refetch).

---

## Réponse API (POST)

```json
{
  "success": true,
  "message": "Plat noté",
  "data": {
    "rating": { "id", "targetType", "targetId", "userId", "orderId", "value", "comment", "extra", "createdAt", "updatedAt" },
    "ratingAvg": 4.33,
    "ratingCount": 27
  }
}
```

---

## Codes d'erreur

- `400` : `value` hors [1,5], `orderId`/`menuId`/`driverId` manquant
- `401` : non authentifié
- `403` : commande pas au user, non livrée, ou cible non liée à la commande
- `404` : commande non trouvée

---

## GET /rating/order/:orderId — Récupérer ses notes pour une commande

Protégé par `firebaseAuth`. L'user connecté récupère les notes (value + comment) qu'il a
lui-même données pour le **plat** et/ou le **livreur** de sa commande.

### Réponse (200)

```json
{
  "success": true,
  "data": {
    "orderId": "...",
    "menuRating": {
      "id": "...",
      "targetType": "menu",
      "targetId": "...",
      "userId": "...",
      "orderId": "...",
      "value": 4,
      "comment": "Délicieux !",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "driverRating": {
      "id": "...",
      "targetType": "driver",
      "targetId": "...",
      "value": 5,
      "comment": "Très ponctuel",
      ...
    }
  }
}
```

- `menuRating` : `null` si l'user n'a pas encore noté le plat.
- `driverRating` : `null` si la commande n'a pas de livreur ou s'il n'a pas encore été noté.

### Garde métier

1. La commande `orderId` doit exister → sinon `404`.
2. `order.userId === uid` → sinon `403`.

### Codes d'erreur

- `400` : `orderId` manquant
- `401` : non authentifié
- `403` : commande pas au user
- `404` : commande non trouvée

---

## GET /menu/:menuId/stats — Stats de commande d'un plat (adaptées au demandeur)

Protégé par `firebaseAuth`. **Jumeau de `/fastFood/:fastFoodId/delivery-stats`**, mais la
cible est un **plat**. Aucune donnée n'est stockée : tout est **calculé à la volée** depuis
les commandes. Le plat porte déjà `ratingAvg`/`ratingCount` (mapper menu → migration 011).

**`totalOrders`** = commandes réelles reçues (livrées + en cours + en attente),
**hors annulations**, depuis la création du plat.

Service : `services/rating/getMenuStats.service.js`.

La **forme de la réponse dépend de qui appelle** :

| Scope | Qui | Contenu |
|---|---|---|
| `self` | marchand propriétaire du plat (`viewerUid === fastfood.userId`) | `totalOrders` + ventilation par statut (`stats`) |
| `client` | user ayant déjà commandé ce plat | `totalOrders` (total du plat, tous users) + `myTotalOrders` (ses commandes) + `hasRated`/`canRate` |
| autre | ni propriétaire ni client du plat | `403` |

### Réponse (200) — scope `self`

```json
{
  "success": true,
  "scope": "self",
  "data": {
    "menuId": "...", "fastFoodId": "...", "name": "Poulet DG", "image": "...",
    "ratingAvg": 4.33, "ratingCount": 27,
    "totalOrders": 126,
    "stats": { "delivered": 120, "inProgress": 4, "pending": 2 }
  }
}
```

### Réponse (200) — scope `client`

```json
{
  "success": true,
  "scope": "client",
  "data": {
    "menuId": "...", "fastFoodId": "...", "name": "Poulet DG", "image": "...",
    "ratingAvg": 4.33, "ratingCount": 27,
    "totalOrders": 126,
    "myTotalOrders": 4,
    "hasRated": false,
    "canRate": true
  }
}
```

- `totalOrders` : total des commandes du plat (tous users) → indicateur de popularité.
- `myTotalOrders` : total des commandes de l'appelant **sur ce plat**.
- `stats` (self uniquement) : ventilation par statut du total (`delivered` + `inProgress` + `pending` = `totalOrders`).
- `canRate` = a reçu ce plat au moins une fois (une commande `delivered`) **et** pas encore noté.

### Garde métier

1. Le plat `menuId` doit exister → sinon `404`.
2. Propriétaire (`viewerUid === fastfood.userId`) → `self`. Sinon, au moins une commande
   de ce plat par l'appelant → `client`. Sinon → `403`.

### Codes d'erreur

- `400` : `menuId` manquant
- `401` : non authentifié
- `403` : ni propriétaire du plat ni client de ce plat
- `404` : plat non trouvé
