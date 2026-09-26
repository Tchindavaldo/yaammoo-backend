# Notifications — Backend

Module gérant l'envoi de push notifications (FCM natif Android + APNs iOS + Expo
Push) et la persistance des fils de notifications en **Supabase** (table
`notifications`).

> Notifications envoyées **par une boutique** à des clients (plan, quota,
> audiences) : voir [notifications-broadcast.md](./notifications-broadcast.md).

## Routes (`/notification`)

| Méthode | Path                                | Garde                                             | Controller                         | Description                                          |
| ------- | ----------------------------------- | ------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| POST    | `/notification`                     | `firebaseAuth` + `adminGuard`                     | `sendPushNotificationController`   | Envoi push direct (sans persistance)                 |
| POST    | `/notification/add`                 | `firebaseAuth` + `adminGuard`                     | `postNotificationController`       | **Crée** la notif + envoie push + émet socket        |
| GET     | `/notification/get?id=`             | public                                            | `getNotificationController`        | Récupère une notif par id                            |
| GET     | `/notification/user?userId=`        | public                                            | `getNotificationsController`       | Liste notifs d'un user (flatten)                     |
| PUT     | `/notification/markAsRead`          | public                                            | `markNotificationAsReadController` | Marque une notif comme lue                           |
| GET     | `/notification/broadcast/:fastFoodId` | `firebaseAuth` + `notifications.send`           | `getBroadcastStateController`      | Plan, villes, derniers envois d'une boutique         |
| POST    | `/notification/broadcast/:fastFoodId` | `firebaseAuth` + `notifications.send`           | `sendBroadcastController`          | Envoi d'une boutique à une audience (sous quota)     |

> ⚠️ `POST /notification` et `POST /notification/add` étaient **publiques** :
> sans compte, on pouvait pousser n'importe quel texte à n'importe quel
> utilisateur. Réservées aux admins depuis la migration 053. L'app n'y fait
> aucun appel ; les services internes passent par `postNotificationService`.

---

## Structure fichiers

```
controllers/notifications/
├── request/
│   ├── postNotification.controller.js       # POST /notification/add
│   ├── getNotification.controller.js        # GET  /notification/get
│   ├── getNotifications.controller.js       # GET  /notification/user
│   └── markNotificationAsRead.controller.js # PUT  /notification/markAsRead
├── broadcast/
│   └── broadcast.controller.js              # GET/POST /notification/broadcast/:fastFoodId
├── FCM/
│   └── sendPushNotification.controller.js   # POST /notification
└── whatsapp/
    └── whatsapp-message.controller.js

services/notification/
├── request/
│   ├── postNotification.service.js          # Core : fil Supabase + push + socket
│   ├── getNotification.services.js
│   ├── getNotifications.services.js
│   └── markNotificationAsRead.services.js
├── broadcast/                               # Envois des boutiques (notifications-broadcast.md)
├── FCM/
│   ├── sendPushNotification.service.js      # Orchestrateur : FCM (Android) + APNs (iOS) + Expo
│   └── sendExpoPushNotification.service.js  # Expo Push API
├── APNS/
│   └── sendApnsPush.service.js              # APNs direct (node-apn, clé .p8)
├── helpers/
│   └── notifyOrderEvent.js                  # getUserTokens, cleanStaleTokens, notifyOrderEvent
├── socket/
└── whatsapp/

repositories/supabase/notifications.repo.js  # groupes + RPC append_notification / mark_notification_read
```

---

## Stockage (Supabase)

Table `notifications` : un **groupe** par destinataire, les notifications dans
`all_notif` (JSONB, plus récente en tête).

| Groupe | Colonnes | Visible par |
|---|---|---|
| Personnel | `user_id` | ce user |
| Boutique | `fastfood_id`, `target = 'all'` | **tous** les users (`getAllForTarget('all')`), sauf la boutique elle-même (filtre `fastFoodId` de `GET /notification/user`) |

- `append_notification(p_group_id, p_user_id, p_fastfood_id, p_target, p_notif)` :
  prepend atomique, crée le groupe s'il n'existe pas.
- `mark_notification_read(p_group_id, p_notif_id, p_user_id)` : ajoute l'uid à
  `isRead` (idempotent).

## Tokens push

Table `user_push_tokens` (`user_id`, `device_id`, `token`, `platform`).
`repos.users.collectUserTokens(user)` sépare `platform = 'ios'` (APNs) et
`'android'` (FCM, ou Expo si le token commence par `ExponentPushToken[`).

---

## Dispatcher push

**`sendPushNotification.service.js`** — `{ tokens, apnsTokens, title, body, data, imageUrl? }` :

- tokens APNs → `sendApnsPush` (node-apn) ;
- autres tokens → `sendSingleToken` : `ExponentPushToken[` → Expo Push API,
  sinon `admin.messaging().send(message)`.

Retour : `{ success, fcm: { details[] }, apns: { sent, failed }, tokensToDelete[] }`.
Stales : FCM `registration-token-not-registered` / `invalid-registration-token`,
APNs `Unregistered` uniquement.

### Image (`imageUrl`)

- **Android (FCM)** : `notification.imageUrl`, affichée par le système.
- **iOS (APNs)** : `mutable-content: 1` + `imageUrl` dans le payload. L'image
  est téléchargée par la **Notification Service Extension** de l'app (cible
  `NotificationService`, lit `imageUrl` ou `fcm_options.image`) ; build sans
  extension ou échec : texte seul. `mutable-content` n'est posé qu'avec une
  image : les autres notifications ne passent pas par l'extension.
- **Expo Push** (Expo Go uniquement) : pas d'image.

### Icône Android (`android.notification.icon`)

⚠️ Le payload FCM doit référencer **`notification_icon`**, jamais `ic_launcher`.

Android ne conserve que le **canal alpha** de l'icône de notification : la
silhouette est redessinée en blanc, la couleur d'origine est ignorée.
`ic_launcher` étant opaque sur toute sa surface, elle s'affichait en **rond gris
uni**. `notification_icon` est le drawable transparent généré par
`expo-notifications` (5 densités), déclaré côté app dans le manifeste via
`default_notification_icon`.

Le bug ne se voyait que **app fermée** : app ouverte, c'est le JS
(`expo-notifications`) qui construit la notification et prend déjà le bon
drawable, alors qu'app fermée, Android affiche directement le bloc `notification`
du payload — où le champ `icon` prime sur le défaut du manifeste.

## postNotification.service.js (flux complet)

**Entrée** : `{ data: {title, body, type, ...}, userId?, fastFoodId?, tokens?[], apnsTokens?[], extraFcmData? }`

1. `userId` ET `fastFoodId` → refus.
2. `validateNotificationData(data)` (`interface/notificationFields.js`) → `errors[]`.
3. Construit `newNotif = { id, title, body, type, isRead: [], createdAt }`.
4. `repos.notifications.appendNotification(...)` → groupe du user, ou de la
   boutique (`target = 'all'`).
5. Push via le dispatcher ; tokens stales supprimés de `user_push_tokens`.
6. `io.to(userId || fastFoodId).emit('newNotification', { notification })` — le
   client injecte via `addFromSocket` sans refetch.

## helpers/notifyOrderEvent.js

| Export | Rôle |
|---|---|
| `getUserTokens(userId)` | `{ fcm, apns }` depuis `user_push_tokens` |
| `cleanStaleTokens(userId, tokens[])` | supprime ces tokens de `user_push_tokens` |
| `notifyOrderEvent({targetUserId, type, title, body, orderId, route})` | tokens + `postNotificationService` avec `extraFcmData: {type, route, orderId}` |

## Types de notifications

| Type                                    | Source (service)                   | Destination | Route deep-link (section-aware) |
| --------------------------------------- | ---------------------------------- | ----------- | ------------------------------- |
| `order_new`                             | `createOrder.js`                   | marchand    | `/(tabs)/boutique`              |
| `order_status` (→ processing)           | `updateOrders.service.js`          | user        | `/(tabs)/cart?section=active`   |
| `order_status` (→ finished / delivered) | `updateOrders.service.js`          | user        | `/(tabs)/cart?section=finished` |
| `order_delivering`                      | `updateOrders.service.js`          | user        | `/(tabs)/cart?section=finished` |
| `order_cancel_by_user`                  | `updateOrders.service.js`          | marchand    | `/(tabs)/notifications`         |
| `order_cancel_by_merchant`              | `updateOrders.service.js`          | user        | `/(tabs)/notifications`         |
| `order_rank_top` (file pending)         | `rankQueue.service.js` (top 5)     | user        | `/(tabs)/cart?section=pending`  |
| `order_rank_top` (file processing)      | `rankQueue.service.js` (top 5)     | user        | `/(tabs)/cart?section=active`   |
| `bonus`                                 | _(à émettre par le service bonus)_ | user        | `/(tabs)/cart?section=bonus`    |
| `boutique_broadcast`                    | `broadcastFanout.js`               | audience de la boutique | `/(tabs)?shop=<nom>` (le home ouvre sa recherche) |

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

- Rank 1 : `"Vous êtes le prochain !"` / `"Votre commande va être traitée."`
- Rank 2-5 : `"Votre commande avance"` / `"Position {rank} dans la file..."`

## Format `isRead`

`isRead` d'une notif est un **array de `userId`** (`string[]`) dans `all_notif`.
Permet :

- les groupes partagés (`target: 'all'`), lus indépendamment par chaque user ;
- la MAJ atomique via `mark_notification_read` ;
- l'émission socket `isRead` vers la room du user pour la sync multi-device.

Le frontend tolère encore boolean/string pour rétro-compat mais écrit toujours en array.

## Clés de design

1. **Dual Channel** : push pour l'OS + socket pour la sync in-app temps réel.
2. **Multi-device** : une ligne `user_push_tokens` par appareil ; `isRead` array.
3. **Stale cleanup** : détection automatique + suppression du token.
4. **Dispatcher hybride** : un seul code path Expo Go / Dev build / Prod.
5. **Deep-link par type** : `extraFcmData.route` calculé côté backend, consommé par le hook `useNotificationSetup` côté client.
