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

### Bonus livraison offerte

`POST /order` accepte un champ d'entrée **`bonusCode`** (string à la racine, non
persisté ; il est retiré avant l'écriture, et le bonus appliqué est restitué via
`deliveryOffer`). Le backend retrouve le bonus **et son type** à partir du code
seul (`repos.bonusRequests.findByCode`) : aucun `type` fourni par le client n'est
utilisé. (Le champ objet `bonus: { type, code }` d'origine a été retiré.)

1. **Avant création** — `resolveDeliveryBonus()` : un code fourni mais invalide
   fait échouer la commande en `400`. Sans `bonusCode`, on retombe sur le bonus
   éventuellement **armé** par le user (`GET /fastfood/all` l'expose déjà).
2. **Après création réussie** — `consumeDeliveryBonus()` : `usageCount++`,
   `armed = false`. **Pas de commande = pas de consommation.**

> ⚠️ `delivery.prix` n'est **jamais** forcé à 0. La gratuité est portée par
> `deliveryOffer` dans la commande renvoyée ; le front décide de l'affichage.

Détail complet du modèle : [bonus.md](./bonus.md#livraison-offerte-armement--consommation).

**Arbitrage campagne / bonus** : si une campagne globale (`delivery_free_mode`)
est active, elle prime et le bonus n'est **pas** consommé.

### Composition et contrôle du `total` — AVANT le paiement

`order.total` (et `amount` racine) sont **fournis par le client** et **recalculés**
côté serveur avant MobileWallet. Formule :
`total = plat×quantity + Σ extras cochés + Σ (drinks cochés × quantite) + delivery.prix`,
où `delivery.prix` n'est ajouté **que si la livraison est livrée ET non offerte**
(offert = verdict serveur bonus/campagne).

Détail complet (recalcul item, offert vs non offert, déduction panier groupé, tous
les cas) : **[payment-amount-check.md](./payment-amount-check.md)**.

### Panier libre — aucune contrainte d'uniformité

Le panier est **libre** : un user peut mélanger modes, dates et créneaux, y
compris **chez une même boutique**. Chaque combinaison distincte est simplement
une **course distincte**, et le groupement de `validatePaymentAmount` facture
exactement le bon nombre de courses. Il n'y a donc rien à interdire.

> Historique : un validateur `validateCartDelivery` imposait `type`/`date`/`time`
> identiques par boutique. Il a été **supprimé** — il bloquait des paniers
> parfaitement facturables (ex. un plat en express + un plat programmé chez le
> même marchand). La clé de groupe porte désormais elle-même toute la
> distinction. Voir [payment-amount-check.md](./payment-amount-check.md).

### Livraison express — jamais d'heure

`validateExpressDelivery()` (`utils/validator/validateExpressDelivery.js`),
appelé dans `postTransaction.service` **avant tout appel à MobileWallet** : une
fois le montant encaissé, refuser une commande obligerait à rembourser.

Règle : une commande livrée en `delivery.type === 'express'` ne peut **pas**
porter de `delivery.time`. L'express signifie « dès que c'est prêt » — il n'y a
pas de créneau. Un `time` présent = contradiction → **400**. Pour choisir un
créneau, le front doit utiliser `type: 'time'`.

- Commandes en retrait (`delivery.status !== true`) → ignorées.
- `delivery.date` reste **requis pour tous les modes** (cf. `orderFields.js`) :
  seul `time` est refusé en express.

### `groupId` — commandes d'un même panier

Une commande = un plat, donc un panier de 3 plats arrive chez le marchand comme
3 commandes. `groupId` (migration 022) leur est attribué **au passage en
`pending`**, uniquement si le lot en compte plusieurs, pour les réafficher
ensemble : un seul client, une seule livraison.

> À distinguer de `order_deliveries.delivery_group_id`, qui groupe par
> (panier, **boutique**) pour la comptabilité : un panier peut couvrir deux
> boutiques — deux courses, mais un seul panier côté client.

### `deliveryGroupId` / `courseBilled` — qui porte la course

Le livreur ne se déplace qu'**une fois par boutique**, mais le panier produit
une commande par plat. Sans indication, le front affiche N frais de livraison
pour une seule course. Les GET commandes exposent donc deux champs, lus depuis
`order_deliveries` (migration 021) :

| Champ | Type | Sens |
|---|---|---|
| `deliveryGroupId` | string | Commandes du même panier partageant un **même départ** |
| `courseBilled` | boolean | `true` sur **une seule** commande du groupe : celle qui porte la course |

**Règle de groupage** — un « départ », c'est la clé
`services/pricing/deliveryGroupKey.js` :

```
fastFoodId | zone | type | date            (+ | time  si type === 'time')
```

Cette clé est **partagée** avec `validatePaymentAmount` : le nombre de courses
versées est exactement celui facturé au user. Une commande en retrait
(`delivery.status !== true`) retourne `null` — aucune course, aucun groupe.

> ⚠️ Corrigé : `settleDelivery` groupait sur le seul `fastFoodId`. C'était juste
> tant qu'un validateur imposait zone/date/créneau identiques par boutique, mais
> ce validateur a été supprimé (panier libre). Un panier avec un plat en express
> et un autre programmé le lendemain dans une autre zone était alors facturé
> **2 courses** au user et n'en versait qu'**1**, l'écart tombant silencieusement
> en marge plateforme.

Lecture front : parmi les commandes partageant un `deliveryGroupId`, une seule a
`courseBilled: true` — les autres sont couvertes par elle.

- Servis par les **trois** GET : `/order/user/all/:userId`, `/order/all/:fastFoodId`,
  `/order/driver/:driverId` (service `services/order/enrichOrdersWithCourse.js`,
  une seule lecture DB par requête).
- **Absents** — pas `null` — si la commande est à emporter (`delivery.status !== true`)
  ou antérieure à la migration 021 : il n'y a alors aucune course.
- Les montants de `order_deliveries` (`realPrice`, `chargedPrice`,
  `platformMargin`) restent comptables et ne sont **jamais** exposés.
- Ajout purement additif : aucun champ existant modifié, R11 ne s'applique pas.

### Règlement livraison — au passage en `pending`

`settleDeliveryService()` écrit la répartition réelle des montants —
`order_settlements` (une ligne par commande, toujours) et `order_deliveries`
(uniquement si livrée) — et consomme le bonus. Il est déclenché **quand la commande
devient payée**, jamais à la mise au panier :

- **Panier** → `updateOrders`, transition `pendingToBuy → pending`. Le lot arrive
  en un seul appel → **une seule course par boutique**, bonus consommé une fois.
- **Achat direct** → `createOrderService`, uniquement si `status === 'pending'`.

`orders.delivery` n'est ni modifié ni supprimé — aucune rupture pour les apps en
production. Voir [pricing.md](./pricing.md).

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
| `{ id, driverId }` | `order.driverId` absent ≠ `driverId` | **Assignation** par le fastFood : pose `driver_id` | `driverOrderAssigned` (→ nouveau `driverId`) + `userOrderUpdated` + `fastFoodOrderUpdated` |
| `{ id, driverId }` | `order.driverId` présent ≠ `driverId` | **Réassignation** à un autre livreur : repose `driver_id` | `driverOrderRemoved` (→ **ancien** `driverId`) + `driverOrderAssigned` (→ nouveau) + `userOrderUpdated` + `fastFoodOrderUpdated` |
| `{ id, driverId: null }` (ou `''`) | `order.driverId` présent | **Reprise « moi-même »** par le fastFood : vide `driver_id` | `driverOrderRemoved` (→ **ancien** `driverId`) + `userOrderUpdated` + `fastFoodOrderUpdated` |
| `{ id, driverId }` | `order.driverId` === `driverId` | **Avance** par le livreur : délègue à `updateOrders.service` (machine à états) → `finished→delivering→delivered` | `driverOrderUpdated` (→ `driverId`) + `userOrderUpdated` + `fastFoodOrderUpdated` (émis par `updateOrders`) |

> `driverOrderRemoved` porte un payload **minimal** `{ data: { orderId } }` : le front livreur n'a
> besoin que de l'`orderId` pour purger la commande de sa liste localement (garde-fou du filtrage
> backend, qui ne renvoie déjà que `driver_id === ce livreur` via `GET /order/driver/:driverId`).

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
