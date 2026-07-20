# Socket Events — Backend

## Infrastructure

- **Serveur** : `BACKEND/src/socket.js` — singleton `getIO()` retourne l'instance Socket.io
- **Init** : `BACKEND/src/server.js` crée le `http.Server` et wrappe Socket.io dessus
- **Rooms** : chaque utilisateur (client, marchand **ou livreur**) rejoint sa propre room via `socket.on('join_user', userId => socket.join(userId))`. Le marchand utilise le même `userId` que son compte user (stocké dans `fastfoods.userId`), et le livreur sa room `uid` (= `driverId`) — **pas de room dédiée ni de `join_driver`**. Les events de délégation (`driverOrderAssigned`, `driverOrderUpdated`) sont émis vers `io.to(driverId)`.

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
| `newFastFoodOrders` | `services/order/createOrder.js`, `services/order/updateOrders.service.js` | marchand |
| `userOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | client |
| `fastFoodOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | marchand |
| `driverOrderAssigned` / `driverOrderUpdated` | `services/order/driverOrders.service.js` | livreur |
| `newFastFoodMenu` / `fastFoodMenuUpdated` / `fastFoodMenuDeleted` | `services/menu/*` | marchand |
| `menuRatingUpdated` | `services/rating/rateMenu.service.js` | marchand + user |
| `driverRatingUpdated` | `services/rating/rateDriver.service.js` | livreur + user + marchand |

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
| `newUserOrder` | `userId` client | `services/order/createOrder.js` (reliableEmit) | `{ message, data: order }` |
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

### Délégation livreur (driver)

Émis depuis `services/order/driverOrders.service.js` (reliableEmit). Cible : room `driverId`
(= uid du livreur, rejointe via `join_user`). En parallèle, le client et le marchand reçoivent
`userOrderUpdated` / `fastFoodOrderUpdated`.

| Event | Destination | Déclencheur | Payload |
|---|---|---|---|
| `driverOrderAssigned` | `driverId` (livreur) | `PUT /order { id, driverId }` (assignation par le fastFood) | `{ data: order }` |
| `driverOrderUpdated` | `driverId` (livreur) | `PUT /order { id, driverId }` (avance auto finished→delivering→delivered) | `{ data: order }` |
| `driverOrderRemoved` | **ancien** `driverId` (livreur) | `PUT /order { id, driverId }` — réassignation à un autre livreur, ou reprise « moi-même » (`driverId` vide/null) | `{ data: { orderId } }` |
| `driverApplicationCreated` | `userId` marchand | `POST /driver/apply` (candidature créée/relancée) | `{ data: application }` |
| `driverApplicationDecided` | `userId` candidat | `PUT /driver/applications/:id` (accepté/refusé) | `{ data: application }` |
| `driverRemoved` | `userId` livreur | `DELETE /driver/:driverId?fastFoodId=` | `{ data: { fastFoodId }, role }` |
| `merchantDriverApplicationDecided` | `userId` marchand | `PUT /driver/applications/:id` (écho marchand) | `{ data: application }` |
| `merchantDriverRemoved` | `userId` marchand | `DELETE /driver/:driverId?fastFoodId=` (écho marchand) | `{ data: { driverId } }` |

> `driverApplicationCreated`/`Decided` déclenchent aussi **push + notif BD** (`newNotification`)
> via `notifyOrderEvent` → `postNotificationService`.

### Notes / Avis (ratings)

Émis depuis `services/rating/*` (reliableEmit). La moyenne va au store du front sans refetch.
Détails feature : [ratings.md](./ratings.md).

| Event | Destination | Déclencheur | Payload |
|---|---|---|---|
| `menuRatingUpdated` | `userId` marchand + `userId` auteur | `POST /menu/:id/rating` | `{ data: { menuId, ratingAvg, ratingCount, value } }` |
| `driverRatingUpdated` | `driverId` livreur + `userId` auteur + `userId` marchand | `POST /driver/:id/rating` | `{ data: { driverId, ratingAvg, ratingCount, value } }` |

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

### Bonus (fidélité)

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `bonus.stats_updated` | `userId` client | `services/bonus/emitBonusStats.js` | `{ data: { bonusStats: { <bonusId>: {day,week,month} } } }` |
| `bonus.claimed` | `userId` client | `services/bonus/claimBonus.service.js` | `{ data: { bonusId, requestId, requestStatus, code, claimedAt, expiresAt } }` |
| `bonus.reward_credentials` | `userId` client | `services/bonus/rewardCredentialsBonus.service.js` | `{ data: { bonusId, requestId, requestStatus, code, rewardCredentials, claimedAt, expiresAt } }` |

- `bonus.stats_updated` fait **seule autorité sur les soldes** : `bonus.claimed` n'en
  porte pas, pour éviter deux sources contradictoires.
- `bonus.reward_credentials` livre les accès des bonus `requiresRewardCredentials`
  (Netflix, clé…). `rewardCredentials` est un objet **libre** ; si le bonus est
  `requiresProfile`, il contient en plus `profile: { name, code }` (le profil
  nominatif et son code d'accès). Réémis à l'identique si un admin **corrige** des
  identifiants déjà livrés. Cf. [bonus.md](./bonus.md).

### Notifications

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newNotification` | `userId` ou `fastFoodId` | `postNotification.service.js` | `{ notification: {...} }` |
| `isRead` | `userId` | `markNotificationAsRead.services.js` | `{ notificationId, userId }` |

### Fastfood

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newFastfood` | **tous** (`io.emit`) | `services/fastfood/createFastFood.js` | `{ message, fastFood }` |
| `fastfoodUpdated` | **tous** (`io.emit`) | `services/fastfood/updateFastFood.js` | `{ message, fastFood }` |

---

## Règles d'adressage

- Par défaut : `io.to(userId).emit(...)` — une room par utilisateur.
- Broadcast global (`io.emit`) : `newGlobalMenu`, `globalMenuUpdated`, `globalMenuDeleted`, `newFastfood`, `fastfoodUpdated`.
- Le `userId` marchand est stocké dans le document `fastfoods` → champ `userId`.

## Récepteurs côté client

Voir la doc frontend : `yaammoo/architecture/socket-events-client.md`.
