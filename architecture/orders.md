# Backend — Services Commandes, Rank Queue, Stock

## Structure des routes

```
BACKEND/src/
├── app.js                              # Express app — monte les routes
├── server.js                           # HTTP + Socket.io init
├── socket.js                           # getIO() singleton
├── routes/orderRoutes.js               # Toutes les routes /order
├── controllers/order/
│   ├── createOrder.js                  # POST /order
│   ├── updateOrder.js                  # PUT /order (commande unique)
│   ├── updateOrdersConstroller.js      # PUT /order/tabs/:userId (bulk)
│   ├── updateOrdersField.controller.js # PUT /order/update-field
│   ├── updateOrdersRankByDate.js       # PUT /order/update-rank-by-date/:fastFoodId
│   ├── getOrders.js                    # GET /order/all/:fastFoodId
│   ├── getUsersOrders.js               # GET /order/user/all/:userId
│   └── getDriverOrders.js              # GET /order/driver/:driverId
└── services/order/
    ├── createOrder.js                  # Logique création + rank + stock + transaction
    ├── driverOrders.service.js         # Délégation livreur : assign + progression statut
    ├── updateOrders.service.js         # Logique mise à jour bulk + transitions statut + rank
    ├── updateOrder.js                  # Logique mise à jour commande unique
    ├── rankQueue.service.js            # assignRank, reindexQueue, reserveRank, resetCounter
    ├── updateOrdersField.service.js    # Mise à jour d'un champ spécifique sur N commandes
    └── updateOrdersRankByDate.service.js # Re-rank full par date (utilitaire admin)
```

---

## Routes

| Méthode | Path | Controller | Description |
|---|---|---|---|
| GET | `/order/all/:fastFoodId` | `getOrders` | Commandes d'une boutique |
| GET | `/order/user/all/:userId` | `getUsersOrders` | Commandes d'un client |
| GET | `/order/driver/:driverId` | `getDriverOrders` | Commandes assignées à un livreur |
| POST | `/order` | `createOrder` | Créer une commande |
| PUT | `/order` | `updateOrder` | Mettre à jour une commande (champs libres) |
| PUT | `/order/tabs/:userId` | `updateOrdersConstroller` | Passer N commandes au statut suivant |
| PUT | `/order/update-field` | `updateOrdersField` | Mettre à jour un champ sur N commandes |
| PUT | `/order/update-rank-by-date/:fastFoodId` | `updateOrdersRankByDate` | Re-rank admin par date |

---

## createOrder.js (service)

**Chemin** : `BACKEND/src/services/order/createOrder.js`

**⚠️ Validation** : `createOrderService` appelle `validateOrder(order)` en tout début.
La validation est ainsi **impossible à contourner**, quel que soit l'appelant
(HTTP `POST /order` OU flux paiement `mwVerdictService` / `postTransaction.service`).
Avant, la validation n'existait que dans le controller → les achats confirmés après
paiement (qui appellent directement le service) échappaient au validateur.

**Champs `delivery`** (déclarés dans `interface/orderFields.js`) : `status`, `date`,
`type` (`express|time`), `time`, `zone`, `prix`, `location`, `phone`, `voiceNoteUri`,
`record`, `note`. Tout champ non déclaré = rejet `Champ non autorisé`.

**Flux** :
1. Si `status === 'pending'` → `reserveRank()` pour obtenir un rank avant création
2. `db.collection('orders').add(orderData)` — crée la commande
3. Si `status === 'pending'` et `menu.id` défini :
   - Relit le document menu en DB (évite race condition)
   - Si `menuData.stock` est un `number` :
     - Si `stock < quantity` → rollback (delete commande) + return `{ error: "..." }`
     - Sinon → décrémente `stock`, émet `globalMenuUpdated` via socket
4. Crée une transaction associée (`postTransactionService`)
5. Retourne `{ id, ...orderData }`

**Émissions socket à la création** :
- `newUserOrder` → client (`order.userId`) via `reliableEmit` (fiable, rejeu au reconnect).
  Payload `{ message, data: order }`. ⚠️ Le front doit appeler `ack()`.
- `newFastFoodOrders` → marchand (`fastFood.userId`) via `reliableEmit` si `status === 'pending'`.
  Payload `{ message, data: [order] }`.
- Le controller (`controllers/order/createOrder.js`) émet en plus `newFastFoodOrder`
  (singulier, brut) au marchand si `status !== 'pendingToBuy'`.

**Erreur stock** : le controller vérifie `orderData?.error` → `400` avec le message.

---

## updateOrders.service.js

**Chemin** : `BACKEND/src/services/order/updateOrders.service.js`

**Signature** : `updateOrders(orders: array|object, userId: string)`

**Transitions de statut autoritaires** (basées sur le statut DB `prevStatus`) :
```
pendingToBuy → pending
pending      → processing
processing   → finished
finished     → delivering
delivering   → delivered
```
Les cancels (`cancelByUser`, `cancelByFastFood`) passent tels quels depuis le client.

**Gestion du rank** :
- Order quitte une file rankée (`pending`/`processing`) → `reindexOps` schedulé + `rank` supprimé du doc
- Order entre dans une file rankée → `assignRank()` attribue un rank atomique via transaction Firestore

**Décrémentation stock** (transition `pendingToBuy → pending`) :
```js
const qty = Number(updateData.quantity ?? prevData.quantity) || 1;
// updateData.quantity = payload client (prioritaire)
// prevData.quantity = fallback si absent du payload
```
- Relit le menu en DB (race condition)
- Si stock insuffisant → return `{ success: false, message: "..." }`
- Émet `globalMenuUpdated` via `io.emit()` (tous les appareils)

**Cleanup sur `finished`** :
- Supprime `clientId` et `periodKey` du doc Firestore (FieldValue.delete())
- Émet `removePeriodKeyDelivering` / `removeClientIdDelivering` aux clients

**Socket emissions** après mise à jour :
- `newFastFoodOrders` → marchand (si commandes passent à `pending`)
- `userOrderUpdated` → client concerné
- `fastFoodOrderUpdated` → marchand
- `newPeriodKeyDelivering` / `newClientIdDelivering` → client + marchand (statut `delivering`)

---

## Délégation à un livreur (driver)

**Chemin** : `BACKEND/src/services/order/driverOrders.service.js`

Canal **parallèle** à la state machine autoritaire (`updateOrders.service`). Piloté par
le frontend : le fastFood délègue une commande à un livreur, qui la fait ensuite progresser.

### Modèle de données

- **`order.driverId`** : id du livreur assigné. Colonne dédiée `orders.driver_id`
  (migration `009_orders_driver_id.sql`, index `idx_orders_driver`). Mappé dans
  `mappers.js` (`order.toSupabase`/`fromSupabase`) + déclaré dans `interface/orderFields.js`.
- **`user.driverId`** : identifie un livreur. **Pas de colonne dédiée** : porté par
  `users.extra_data` (pass-through du mapper user). `GET /user/:uid` le renvoie tel quel ;
  le front en dérive `isDriver`.

### Endpoints (tous via `PUT /order`, branché dans `updateOrderService`)

> ⚠️ Le front **n'envoie jamais de statut** pour le livreur. On distingue assignation
> et progression selon que la commande est **déjà assignée à ce livreur** ou non.

| Payload | Condition | Effet | Events |
|---|---|---|---|
| `{ id, driverId }` | `order.driverId` ≠ `driverId` (ou vide) | **Assignation** par le fastFood : pose `driver_id` | `driverOrderAssigned` (→ `driverId`) + `userOrderUpdated` + `fastFoodOrderUpdated` |
| `{ id, driverId }` | `order.driverId` === `driverId` | **Avance** par le livreur : délègue à `updateOrders.service` (machine à états) → `finished→delivering→delivered` | `driverOrderUpdated` (→ `driverId`) + `userOrderUpdated` + `fastFoodOrderUpdated` (émis par `updateOrders`) |

- **Avance livreur** (`driverAdvanceStatus`) : autorisée uniquement si `order.status` ∈
  `finished`|`delivering` (sinon **409**), et si `order.driverId === driverId` (sinon **403**).
  Le statut est décidé par la **même machine à états** que le reste — jamais posé en dur.
- `getDriverOrders(driverId)` → `repos.orders.getByDriver()` → `GET /order/driver/:driverId`.
- **Socket livreur** : le livreur est un user ; `driverId` = son uid. Il reçoit ses events sur
  sa room `uid` déjà rejointe via `join_user` (comme client/marchand) — pas de `join_driver`.
- Le controller `updateOrder` renvoie désormais le bon code HTTP en cas d'échec
  (`result.code` : 400/403/404), sinon 200 avec la shape historique `{ message, data: result }`.

---

## rankQueue.service.js

**Chemin** : `BACKEND/src/services/order/rankQueue.service.js`

**Collection Firestore** : `rankCounters` — documents `{fastFoodId}_{deliveryDate}_{status}`

### `reserveRank({ fastFoodId, deliveryDate, status })`
- Transaction Firestore : lit le compteur, incrémente, retourne le nouveau rank
- Utilisé à la **création** d'une commande `pending` (avant le `add()`)

### `assignRank({ fastFoodId, deliveryDate, status, orderRef, extraUpdate? })`
- Transaction Firestore : incrémente compteur + update le doc commande avec le rank
- Utilisé lors d'une **transition** vers `pending` ou `processing`

### `reindexQueue({ fastFoodId, deliveryDate, status, removedRank, fastFoodUserId? })`
- Query toutes les commandes de la file avec `rank > minRank`
- Batch update : décrémente de 1 par rank supprimé inférieur
- Décrémente le compteur de la file
- Émet socket `userOrderUpdated` (clients) + `ordersRankUpdated` + `fastFoodOrderUpdated` (marchand)
- Envoie push FCM aux clients si file ≤ 20 commandes (anti-spam)

### `resetCounter({ fastFoodId, deliveryDate, status, value })`
- Réinitialise le compteur à une valeur donnée (utilitaire admin)

---

## Gestion du stock — règles métier

| Déclencheur | Service | Comportement |
|---|---|---|
| Commande directe (home) status `pending` | `createOrder.js` | Décrémente + rollback si insuffisant |
| Panier → `pending` (transition `pendingToBuy → pending`) | `updateOrders.service.js` | Décrémente + return error si insuffisant |
| Ajout au panier (`pendingToBuy`) | — | Aucune décrémentation |
| `menu.stock` non défini | — | Commande passe librement |

**Race condition** : dans les deux cas, le stock est relu depuis Firestore juste avant la décrémentation (pas de confiance au stock reçu du client).

**Socket** : `io.emit('globalMenuUpdated', { menuId, menu })` → tous les appareils → `useSocketEvents.ts` → `refreshFastFoods()`

---

## Validator

**Chemin** : `BACKEND/src/utils/validator/validateOrder.js`

Appelé dans `updateOrders.service.js` avant chaque traitement. Retourne un tableau d'erreurs `{ field, message }`.
