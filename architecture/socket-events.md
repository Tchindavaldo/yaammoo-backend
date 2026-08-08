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
| `wallet.credited` | `services/transaction/creditMerchant.service.js`, `creditDriver.service.js` | marchand **ou livreur** |
| `wallet.withdrawal` | `services/wallet/withdraw.service.js` | marchand |
| `payment.settled` | `services/transaction/mwVerdictService.js` | client |
| `newFastFoodOrders` | `services/order/createOrder.js`, `services/order/updateOrders.service.js` | marchand |
| `userOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | client |
| `fastFoodOrderUpdated` | `updateOrders.service.js`, `updateOrder.js` | marchand |
| `driverOrderAssigned` / `driverOrderUpdated` | `services/order/driverOrders.service.js` | livreur |
| `newFastFoodMenu` / `fastFoodMenuUpdated` / `fastFoodMenuDeleted` | `services/menu/*` | marchand |
| `menuRatingUpdated` | `services/rating/rateMenu.service.js` | marchand + user |
| `driverRatingUpdated` | `services/rating/rateDriver.service.js` | livreur + user + marchand |
| `bonus.reward_credentials` | `services/bonus/rewardCredentialsBonus.service.js` | client |
| `bonus.redeemed` | `services/bonus/applyDeliveryBonus.service.js` | client |
| `bonus.armed` / `bonus.disarmed` | `services/bonus/armBonus.service.js` | client |
| `support.message` | `services/support/emitSupportMessage.js` | client + marchand |

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
| `support.message` | `userId` client **et** `fastFoodId` boutique (si le fil en vise une) | `services/support/emitSupportMessage.js` | `{ threadId, thread, message }` |

### Commandes — marchand

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `newFastFoodOrder` | `userId` marchand | `controllers/order/createOrder.js` | `{ message, data: order }` |
| `newFastFoodOrders` | `userId` marchand | `updateOrders.service.js` | `{ message, data: order[] }` |
| `fastFoodOrderUpdated` | `userId` marchand | `updateOrders.service.js` | `{ data: order }` — **vue marchand** (prix réels + `customerTotal`, cf. [pricing.md](./pricing.md#ce-que-chaque-rôle-voit)) |
| `fastFoodOrdersUpdated` | `userId` marchand | `updateOrdersField.service.js` | `{ message, field, orders: order[] }` |
| `ordersRankUpdated` | `userId`/`fastFoodId` marchand | `updateOrdersRankByDate.service.js`, `rankQueue.service.js` | `{ message, orders: order[] }` — **vue marchand** |

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
| `wallet.credited` | `userId` marchand | `creditMerchant.service.js` | `{ transactionId, type:'merchant_credit', direction:'payin', amount, grossAmount, name, fastFoodId, relatedOrderId, createdAt }` — `amount` = `order_settlements.items_real`, pas le prix client ; `mwCommission` / `yaammooFee` retirés (cf. [wallet.md](./wallet.md)) |
| `wallet.credited` | `uid` **livreur** | `creditDriver.service.js` | même forme, `type:'driver_credit'` — `amount` = `order_settlements.driver_amount`. Émis **à la livraison**, uniquement pour les boutiques en `deliveryBy = 'platform'` (cf. [pricing.md](./pricing.md)) |
| `wallet.withdrawal` | `userId` marchand | `withdraw.service.js`, `webhookPayout.service.js` | `{ withdrawalId, type:'withdrawal', direction:'payout', amount, status, network, newBalance?, reason? }` |

### Bonus (fidélité)

| Event | Destination | Émetteur | Payload |
|---|---|---|---|
| `bonus.stats_updated` | `userId` client | `services/bonus/emitBonusStats.js` | `{ data: { bonusStats: { <bonusId>: {day,week,month} } } }` |
| `bonus.claimed` | `userId` client | `services/bonus/claimBonus.service.js` | `{ data: { bonusId, requestId, requestStatus, code, claimedAt, startsAt, expiresAt, proofVideoUrl } }` |
| `bonus.flyer_downloaded` | `userId` client | `services/bonus/downloadFlyer.service.js` | `{ data: { bonusId, flyerUrl, downloadedAt, lastDownloadedAt, downloadCount, claimDelayHours, claimableAt, postWindow } }` |
| `bonus.activation_changed` | **broadcast global** (tous les sockets) | `services/bonus/broadcastBonusActivation.js` | `{ data: { bonusId, active, type, name, fastFoodId, fastFoodName, changedAt } }` |
| `bonus.created` | **broadcast global** (tous les sockets) | `services/bonus/postBonus.service.js` | **aucun payload** |
| `bonus.reward_credentials` | `userId` client | `services/bonus/rewardCredentialsBonus.service.js` (**reliableEmit**) | `{ data: { bonusId, requestId, requestStatus, code, rewardCredentials, claimedAt, startsAt, expiresAt } }` |
| `bonus.armed` | `userId` client | `services/bonus/armBonus.service.js` | `{ data: { bonusId, armed:true, disarmedBonusIds, deliveryOffer } }` |
| `bonus.disarmed` | `userId` client | `services/bonus/armBonus.service.js` | `{ data: { bonusId, armed:false, disarmedBonusIds:[], deliveryOffer:null } }` |
| `bonus.redeemed` | `userId` client | `services/bonus/applyDeliveryBonus.service.js` | `{ data: { bonusId, code, usageCount, usageLimit, remainingUses, redeemed } }` |

- `bonus.redeemed` : émis à **chaque consommation d'une utilisation** (`usageCount++`),
  par l'unique chemin de consommation — `consumeDeliveryBonus` (commande avec
  livraison offerte). Porte le nouveau `usageCount`/`remainingUses` — c'est le seul
  event qui suit le compteur d'utilisations. **Fiabilisé via `reliableEmit`**
  (rejoué au `join_user`) pour que tous les appareils du user restent synchronisés.
- Les bonus `requiresRewardCredentials` (Netflix…) **n'émettent pas** `bonus.redeemed` :
  leur contrepartie est la livraison des identifiants, signalée par
  `bonus.reward_credentials` + push. Cycle fermé à l'expiration, sans compteur.
- `bonus.flyer_downloaded` : émis par `GET /bonus/:id/flyer`. `claimableAt` vaut
  `postWindow.end + claimDelayHours` sur un bonus à campagne (`criteria.schedule`),
  et `downloadedAt + claimDelayHours` sur un bonus sans campagne. Sert aux autres
  appareils du user à afficher le même compte à rebours ; `postWindow` porte le
  créneau de publication (`null` sans campagne). `proofVideoUrl` sur
  `bonus.claimed` n'est renseigné que pour un bonus `status_view`.
- `bonus.created` : émis à la création (`POST /bonus`), **sans payload** — c'est un
  simple signal « la liste a changé ». Le front réagit par un `GET /bonus/all`, seul
  capable de renvoyer les bonus **enrichis pour le user courant** (soldes,
  `requestStatus`…) : un payload de définition brute créerait une seconde source
  de vérité, incomplète.
- `bonus.activation_changed` : **`io.emit` global**, pas de room — un bonus activé
  ou désactivé change ce que tous les users voient. Accompagné d'un **push** à tous
  les users (`broadcastBonusActivation`). Émis uniquement sur un **changement réel**
  de `active` via `PATCH /bonus/:id` (un PATCH qui renvoie la même valeur ne diffuse rien).
  ⚠️ La room `app:<appId>` mentionnée ailleurs n'existe pas côté serveur : aucun
  `socket.join` ne la crée (cf. `socket.js`).
- `bonus.stats_updated` fait **seule autorité sur les soldes** : `bonus.claimed` n'en
  porte pas, pour éviter deux sources contradictoires.
- `bonus.armed` / `bonus.disarmed` : deux events **distincts**, émis par
  `POST` / `DELETE /bonus/:id/arm`, avec le **même payload que la réponse HTTP**.
  L'appareil appelant est déjà à jour par cette réponse : les events servent aux
  **autres appareils** du user, qui afficheraient sinon un armement périmé.
  `disarmedBonusIds` liste les bonus désarmés par recouvrement (exclusivité) —
  le front doit les repasser à non-armés ; il est toujours vide sur
  `bonus.disarmed`, l'exclusivité ne jouant qu'à l'armement.
  **Fiabilisés via `reliableEmit`** : rejoués au `join_user` si l'appareil était
  hors ligne ; le front doit ACK pour arrêter le rejeu (cf. § Events fiables).
- `bonus.reward_credentials` livre les accès des bonus `requiresRewardCredentials`
  (Netflix, clé…). `rewardCredentials` est un objet **libre** ; si le bonus est
  `requiresProfile`, il contient en plus `profile: { name, code }` (le profil
  nominatif et son code d'accès). Réémis à l'identique si un admin **corrige** des
  identifiants déjà livrés. Cf. [bonus.md](./bonus.md).
- `startsAt` porte le **départ de la validité** (`expiresAt = startsAt + claimDuration`),
  distinct de `claimedAt` (date du claim). Sur `bonus.claimed` d'un bonus
  `requiresRewardCredentials`, `startsAt` et `expiresAt` valent `null` : la
  réclamation est `pending`, rien n'expire avant livraison. C'est
  `bonus.reward_credentials` qui les renseigne (date de livraison), permettant au
  front de rafraîchir les dates sans re-GET. Figé à la première livraison : une
  correction d'identifiants ne prolonge pas la validité. Cf.
  [bonus.md § Départ de validité](./bonus.md).

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
