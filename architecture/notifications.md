# Notifications — Backend

Module gérant l'envoi de push notifications (FCM natif + Expo Push) et la persistance Firestore.

## Routes (`/notification`)

| Méthode | Path | Controller | Description |
|---|---|---|---|
| POST | `/notification` | `sendPushNotificationController` | Envoi push direct (sans persistance) |
| POST | `/notification/add` | `postNotificationController` | **Crée** notif Firestore + envoie push + émet socket |
| GET | `/notification/get?id=` | `getNotificationController` | Récupère une notif par id |
| GET | `/notification/user?userId=` | `getNotificationsController` | Liste notifs d'un user (flatten) |
| PUT | `/notification/markAsRead` | `markNotificationAsReadController` | Marque une notif comme lue |

---

## Structure fichiers

```
controllers/notifications/
├── request/
│   ├── postNotification.controller.js       # POST /notification/add
│   ├── getNotification.controller.js        # GET  /notification/get
│   ├── getNotifications.controller.js       # GET  /notification/user
│   └── markNotificationAsRead.controller.js # PUT  /notification/markAsRead
├── FCM/
│   └── sendPushNotification.controller.js   # POST /notification
└── whatsapp/
    └── whatsapp-message.controller.js

services/notification/
├── request/
│   ├── postNotification.service.js          # Core : Firestore + push + socket
│   ├── getNotification.services.js
│   ├── getNotifications.services.js
│   └── markNotificationAsRead.services.js
├── FCM/
│   ├── sendPushNotification.service.js      # Dispatcher Expo/FCM
│   └── sendExpoPushNotification.service.js  # Expo Push API
├── helpers/
│   └── notifyOrderEvent.js                  # getUserTokens, cleanStaleTokens, notifyOrderEvent
├── socket/
└── whatsapp/
```

---

## Dispatcher hybride Expo ↔ FCM

**`sendPushNotification.service.js`** — inspecte le token :
- Commence par `ExponentPushToken[` → délégué à `sendExpoPushNotification` (POST `https://exp.host/--/api/v2/push/send`).
- Sinon → `admin.messaging().send(message)` (firebase-admin).

Retour unifié : `{ success: boolean, response?, error? }`.

## postNotification.service.js (flux complet)

**Entrée** : `{ data: {title, body, type, ...}, userId?, fastFoodId?, token?, tokens?[], extraFcmData? }`

1. `targetTokens = tokens?.length ? tokens : (token ? [token] : [])`
2. `validateNotificationData(data)` → retourne `errors[]` si invalide (400).
3. `getNotificationService(userId || fastFoodId)` → cherche le doc container existant.
4. Crée `newNotif = { id, title, body, type, isRead: [], createdAt }`.
5. **Branche nouveau user** : `db.collection('notification').add({ userId/fastFoodId, allNotif: [newNotif] })`.
   **Branche existant** : `update({ allNotif: [newNotif, ...existing] })`.
6. `sendPushToAll(...)` :
   - `Promise.allSettled(targetTokens.map(t => sendPushNotification({token: t, ...})))`.
   - Collecte les tokens stales (`registration-token-not-registered`, `DeviceNotRegistered`, `not a valid FCM registration token`).
   - Appelle `cleanStaleTokens(userId, stale)` → `arrayRemove` dans `users/{uid}.fcmTokens`.
7. `io.to(userId || fastFoodId).emit('newNotification', { notification })` — pour sync UI en temps réel.
8. Retourne `{ success, data, message }`.

## postNotification.controller.js

- Reçoit `{ userId, fastFoodId, token }` dans `req.body`.
- Si pas `userId` ni `fastFoodId` → `400 parametre manquant`.
- Si `token` présent → `tokens = [token]`.
- Sinon si `userId` → `tokens = await getUserTokens(userId)` (lit `users/{uid}.fcmTokens`).
- Passe `{ data: req.body, userId, fastFoodId, tokens }` au service.

## helpers/notifyOrderEvent.js

| Export | Rôle |
|---|---|
| `getUserTokens(userId)` | Lit `users/{uid}.fcmTokens[]` dans Firestore |
| `cleanStaleTokens(userId, tokens[])` | `arrayRemove` sur `users/{uid}.fcmTokens` |
| `notifyOrderEvent({targetUserId, type, title, body, orderId, ...})` | Central helper : fetch tokens + postNotificationService avec `extraFcmData: {type, route, orderId}` |

## Types de notifications

| Type | Source (service) | Destination | Route deep-link (section-aware) |
|---|---|---|---|
| `order_new` | `createOrder.js` | marchand | `/(tabs)/boutique` |
| `order_status` (→ processing) | `updateOrders.service.js` | user | `/(tabs)/cart?section=active` |
| `order_status` (→ finished / delivered) | `updateOrders.service.js` | user | `/(tabs)/cart?section=finished` |
| `order_delivering` | `updateOrders.service.js` | user | `/(tabs)/cart?section=finished` |
| `order_cancel_by_user` | `updateOrders.service.js` | marchand | `/(tabs)/notifications` |
| `order_cancel_by_merchant` | `updateOrders.service.js` | user | `/(tabs)/notifications` |
| `order_rank_top` (file pending) | `rankQueue.service.js` (top 5) | user | `/(tabs)/cart?section=pending` |
| `order_rank_top` (file processing) | `rankQueue.service.js` (top 5) | user | `/(tabs)/cart?section=active` |
| `bonus` | *(à émettre par le service bonus)* | user | `/(tabs)/cart?section=bonus` |

**Convention query param** : `route` précis calculé côté backend dans `buildTransitionNotif()` / `rankQueue`. Le frontend consomme via `useLocalSearchParams()` dans `app/(tabs)/cart.tsx` pour basculer sur la bonne section.

## Transitions de statut → notifications (updateOrders.service.js)

- `pendingToBuy → pending` : notify marchand (order_new)
- `pending → processing` : notify user (order_status)
- `processing → finished` : notify user (order_status)
- `finished → delivering` : notify user (order_delivering)
- `delivering → delivered` : notify user (order_status)
- `* → cancelByUser` : notify marchand (order_cancel_by_user)
- `* → cancelByFastFood` : notify user (order_cancel_by_merchant)

## Rank Queue Notifications (rankQueue.service.js)

Filtre sur `rank <= 5` uniquement (anti-spam) :
- Rank 1 : `"🎉 Vous êtes le prochain !"` / `"Votre commande va être traitée."`
- Rank 2-5 : `"Votre commande avance"` / `"Position {rank} dans la file..."`

## Test manuel (curl)

```bash
curl -X POST http://localhost:5000/notification/add \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uid>","title":"Test","body":"Hello","type":"order_status"}'
```

→ Charge `fcmTokens` du user depuis Firestore, envoie à chaque token via dispatcher, persiste dans `notification/`, émet socket `newNotification` sur la room `userId`.

## Validator

**`utils/validator/validateNotificationData.js`** — retourne `errors[]`. Champs requis typiques : `title`, `body`.

## Clés de design

1. **Dual Channel** : FCM pour OS-level + Socket pour sync in-app temps réel.
2. **Multi-device** : `fcmTokens` array + `arrayUnion` côté user service.
3. **Stale cleanup** : détection automatique + `arrayRemove`.
4. **Dispatcher hybride** : un seul code path Expo Go / Dev build / Prod.
5. **Deep-link par type** : `extraFcmData.route` calculé côté backend, consommé par le hook `useNotificationSetup` côté client.
