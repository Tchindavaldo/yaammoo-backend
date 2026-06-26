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
│   └── getUsersOrders.js               # GET /order/user/all/:userId
└── services/order/
    ├── createOrder.js                  # Logique création + rank + stock + transaction
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
| POST | `/order` | `createOrder` | Créer une commande |
| PUT | `/order` | `updateOrder` | Mettre à jour une commande (champs libres) |
| PUT | `/order/tabs/:userId` | `updateOrdersConstroller` | Passer N commandes au statut suivant |
| PUT | `/order/update-field` | `updateOrdersField` | Mettre à jour un champ sur N commandes |
| PUT | `/order/update-rank-by-date/:fastFoodId` | `updateOrdersRankByDate` | Re-rank admin par date |

---

## createOrder.js (service)

**Chemin** : `BACKEND/src/services/order/createOrder.js`

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
