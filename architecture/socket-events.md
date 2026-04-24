# Socket Events — Backend

## Infrastructure

- **Serveur** : `BACKEND/src/socket.js` — singleton `getIO()` retourne l'instance Socket.io
- **Init** : `BACKEND/src/server.js` crée le `http.Server` et wrappe Socket.io dessus
- **Rooms** : chaque utilisateur (client ou marchand) rejoint sa propre room via `socket.on('join_user', userId => socket.join(userId))`. Le marchand utilise le même `userId` que son compte user (stocké dans `fastfoods.userId`) — pas de room `fastFoodId` séparée.

---

## Événements émis par le backend

### Commandes — nouvelles

| Event | Destination | Émetteur | Payload | Déclencheur |
|---|---|---|---|---|
| `newUserOrder` | `userId` client | `controllers/order/createOrder.js` | `{ message, data: order }` | Création commande |
| `newFastFoodOrder` | `userId` marchand | `controllers/order/createOrder.js` | `{ message, data: order }` | Création si statut ≠ `pendingToBuy` |
| `newFastFoodOrders` | `userId` marchand | `services/order/updateOrders.service.js` | `{ message, data: pendingOrders[] }` | Commandes passent à `pending` |

### Commandes — mises à jour

| Event | Destination | Émetteur | Payload | Déclencheur |
|---|---|---|---|---|
| `userOrderUpdated` | `userId` client | `updateOrders.service.js` | `{ data: order }` | Statut mis à jour (sauf `pending`) |
| `fastFoodOrderUpdated` | `userId` marchand | `updateOrders.service.js` | `{ data: order }` | Statut mis à jour (sauf `pending`) |
| `ordersRankUpdated` | `userId` marchand | `rankQueue.service.js` | `{ message, file, orders[] }` | Réindexation rang après sortie file |

### Livraisons

| Event | Destination | Émetteur | Payload | Déclencheur |
|---|---|---|---|---|
| `newPeriodKeyDelivering` | client + marchand | `updateOrders.service.js` | `{ periodKey }` | Commande passe à `delivering` avec `periodKey` |
| `removePeriodKeyDelivering` | client + marchand | `updateOrders.service.js` | `{ periodKey }` | Commande passe à `finished` |
| `newClientIdDelivering` | client + marchand | `updateOrders.service.js` | `{ clientId }` | Commande passe à `delivering` avec `clientId` |
| `removeClientIdDelivering` | client + marchand | `updateOrders.service.js` | `{ clientId }` | Commande passe à `finished` |

### Menus / Stock

| Event | Destination | Émetteur | Payload | Déclencheur |
|---|---|---|---|---|
| `globalMenuUpdated` | **tous** (`io.emit`) | `createOrder.js`, `updateOrders.service.js` | `{ message, menuId, menu }` | Stock décrémenté après commande `pending` |

### Notifications

| Event | Destination | Émetteur | Payload | Déclencheur |
|---|---|---|---|---|
| `newNotification` | `userId` ou `fastFoodId` | `services/notification/request/postNotification.service.js` | `{ notification: {...} }` | À chaque nouvelle notif Firestore |

---

## Règles d'adressage

- Par défaut : `io.to(userId).emit(...)` — une room par utilisateur.
- Broadcast global : uniquement pour `globalMenuUpdated` (stock impacte tous les appareils).
- Le `userId` marchand est stocké dans le document `fastfoods` → champ `userId`.

## Récepteurs côté client

Voir la doc frontend : `yaammoo/architecture/socket-events-client.md`.
