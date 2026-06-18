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
| `payment.settled` | `services/transaction/webhookMobilewallet.service.js` | client |
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
