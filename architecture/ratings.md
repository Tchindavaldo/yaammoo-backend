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

Le catalogue (`GET /menu/:fastFoodId`) et le profil livreur portent donc déjà la
moyenne — **aucune requête d'agrégat** au chargement.

### Fonction SQL `rate_target(...)`

Upsert + recalcul en **une transaction** (verrous `FOR UPDATE` → pas de race) :

- **nouvelle note** : `avg = (avg*count + value) / (count+1)` ; `count += 1`.
- **re-note** : `avg = (avg*count - oldValue + value) / count` ; `count` inchangé.

Route vers `menus` ou `users` selon `target_type`. Renvoie la note + `rating_avg`/`rating_count` à jour.

---

## Routes

| Méthode | Endpoint | Auth | Rôle |
|---|---|---|---|
| POST | `/menu/:menuId/rating` | ✅ `firebaseAuth` | Noter un plat (`{ orderId, value, comment? }`) |
| GET | `/menu/:menuId/ratings` | public | Liste des avis d'un plat |
| POST | `/driver/:driverId/rating` | ✅ `firebaseAuth` | Noter un livreur (`{ orderId, value, comment? }`) |
| GET | `/driver/:driverId/ratings` | public | Liste des avis d'un livreur |

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
