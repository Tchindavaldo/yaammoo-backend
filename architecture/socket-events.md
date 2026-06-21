# Socket Events — Backend

## Infrastructure

- **Serveur** : `BACKEND/src/socket.js` — singleton `getIO()` retourne l'instance Socket.io
- **Init** : `BACKEND/src/server.js` crée le `http.Server` et wrappe Socket.io dessus
- **Rooms** : chaque utilisateur (client ou marchand) rejoint sa propre room via `socket.on('join_user', userId => socket.join(userId))`. Le marchand utilise le même `userId` que son compte user (stocké dans `fastfoods.userId`) — pas de room `fastFoodId` séparée.

---

## Émission FIABLE (reprise après déconnexion)

Socket.io est fire-and-forget : un event émis pendant que l'utilisateur est hors ligne est
**perdu**. Pour les events importants, on utilise une **outbox persistée + rejeu + ACK natif**.

- **Helper** : `src/utils/reliableEmit.js` → `reliableEmit(io, userId, event, payload)`.
  1. Persiste l'event dans `outbox_events` (`delivered_at = null`).
  2. Émet avec l'**ACK natif Socket.io** (`io.to(userId).timeout(...).emit(event, body, cb)`).
  3. Si le client appelle le callback → `delivered_at` renseigné. Sinon (hors ligne) → reste à rejouer.
- **Rejeu** : au `join_user`, `replayUndelivered(io, userId)` ré-émet les events non délivrés
  (cf. `src/socket.js`).
- **Dédoublonnage côté front** : chaque payload porte `__eventId` (+ `__replay: true` au rejeu).
  Le front **doit appeler le callback ACK** reçu en 2ᵉ argument du handler, et ignorer un
  `__eventId` déjà traité (le live et le rejeu peuvent se chevaucher).
- **Purge** : `repos.outboxEvents.purge()` (toutes les 6h) supprime les events délivrés et les
  non délivrés > **7 jours** (`OUTBOX_PURGE_INTERVAL_MS`, TTL en dur 7j).
- **Table** : `outbox_events` (migration `005_outbox_events.sql`).

### Events fiabilisés (persistés + rejoués)

| Event | Source | Cible |
|---|---|---|
| `wallet.credited` | `services/transaction/creditMerchant.service.js` | marchand |
| `wallet.withdrawal` | `services/wallet/withdraw.service.js` | marchand |
| `payment.settled` | `services/transaction/mwVerdictService.js` | client |
| `newFastFoodOrders` | `services/order/updateOrders.service.js` | marchand |
| `userOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | client |
| `fastFoodOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | marchand |
| `newFastFoodMenu` / `fastFoodMenuUpdated` / `fastFoodMenuDeleted` | `services/menu/*` | marchand |

> Les broadcasts catalogue (`globalMenu*`) restent **fire-and-forget** : le front recharge le
> catalogue (GET) à la reconnexion plutôt que de rejouer des events à tous. Les events de file
> d'attente fins (`*Rank*`, `*PeriodKey*`, `*ClientId*`) restent aussi fire-and-forget
> (recalculés au re-fetch).

### Côté frontend (à implémenter)

```js
socket.on('wallet.credited', (data, ack) => {
  if (seen.has(data.__eventId)) return ack?.();   // déjà traité (live/replay)
  seen.add(data.__eventId);
  // ... mettre à jour le store global (pas seulement la page courante)
  ack?.();   // confirme la réception → le backend marque l'event délivré
});
```
Le même pattern (`ack?.()` + dédoublonnage `__eventId`) s'applique à tous les events fiabilisés.

---

## Événements émis par le backend

> **Principe** : chaque event porte sa donnée complète dans le payload. Le front met
> à jour son store **directement avec le `data` reçu — sans refetch HTTP**. Les seuls
> events "minces" (`payment.settled`, `isRead`, `*PeriodKey*`, `*ClientId*`) portent
> un flag/identifiant qui EST la donnée (rien d'autre à transporter).

### Commandes — client

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newUserOrder` | `userId` client | `controllers/order/createOrder.js` | `{ message, data: order }` |
| `userOrderUpdated` | `userId` client | `updateOrders.service.js` | `{ data: order }` |
| `userOrdersUpdated` | `userId` client | `updateOrdersField.service.js` | `{ message, field, orders: order[] }` |

### Commandes — marchand

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newFastFoodOrder` | `userId` marchand | `controllers/order/createOrder.js` | `{ message, data: order }` |
| `newFastFoodOrders` | `userId` marchand | `updateOrders.service.js` | `{ message, data: order[] }` |
| `fastFoodOrderUpdated` | `userId` marchand | `updateOrders.service.js` | `{ data: order }` |
| `fastFoodOrdersUpdated` | `userId` marchand | `updateOrdersField.service.js` | `{ message, field, orders: order[] }` |
| `ordersRankUpdated` | `userId`/`fastFoodId` marchand | `updateOrdersRankByDate.service.js`, `rankQueue.service.js` | `{ message, orders: order[] }` |

### Livraisons (client + marchand)

| Event | Émetteur | Payload |
|---|---|---|
| `newPeriodKeyDelivering` | `updateOrders.service.js` | `{ periodKey }` |
| `removePeriodKeyDelivering` | `updateOrders.service.js` | `{ periodKey }` |
| `newClientIdDelivering` | `updateOrders.service.js` | `{ clientId }` |
| `removeClientIdDelivering` | `updateOrders.service.js` | `{ clientId }` |

### Menus / Stock

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newMenu` | `fastFoodId` | `controllers/menu/postMenu.controller.js` | `{ message, data: menu }` |
| `newGlobalMenu` | **tous** (`io.emit`) | `services/menu/postMenu.service.js` | `{ message, menu }` |
| `newFastFoodMenu` | `userId` marchand | `services/menu/postMenu.service.js` | `{ message, menu }` |
| `globalMenuUpdated` | **tous** (`io.emit`) | `updateMenu.service.js`, `updateOrders.service.js` | `{ message, menuId, menu }` |
| `fastFoodMenuUpdated` | `userId` marchand | `updateMenu.service.js` | `{ message, menuId, menu }` |
| `globalMenuDeleted` | **tous** (`io.emit`) | `deleteMenu.service.js` | `{ message, fastFood, menuId }` |
| `fastFoodMenuDeleted` | `userId` marchand | `deleteMenu.service.js` | `{ message, fastFood, menuId }` |

### Paiement & Wallet

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `payment.settled` | `userId` client | `mwVerdictService.js` | `{ status, transaction_id, amount, source }` |
| `newTransaction` | `userId` (client ou marchand) | `postTransaction.service.js`, `mwVerdictService.js` | `{ message, data: transaction }` |
| `wallet.credited` | `userId` marchand | `creditMerchant.service.js` | `{ transactionId, type:'merchant_credit', direction:'payin', amount, grossAmount, mwCommission, yaammooFee, name, fastFoodId, relatedOrderId, createdAt }` |
| `wallet.withdrawal` | `userId` marchand | `withdraw.service.js`, `webhookPayout.service.js` | `{ withdrawalId, type:'withdrawal', direction:'payout', amount, status, network, newBalance?, reason? }` |

### Notifications

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newNotification` | `userId` ou `fastFoodId` | `postNotification.service.js` | `{ notification: {...} }` |
| `isRead` | `userId` | `markNotificationAsRead.services.js` | `{ notificationId, userId }` |

### Fastfood

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newFastfood` | **tous** (`io.emit`) | `services/fastfood/createFastFood.js` | `{ message, fastFood }` |

---

## Règles d'adressage

- Par défaut : `io.to(userId).emit(...)` — une room par utilisateur.
- Broadcast global (`io.emit`) : `newGlobalMenu`, `globalMenuUpdated`, `globalMenuDeleted`, `newFastfood`.
- Le `userId` marchand est stocké dans le document `fastfoods` → champ `userId`.

## Récepteurs côté client

Voir la doc frontend : `yaammoo/architecture/socket-events-client.md`.
