# Notifications boutique — envois aux clients

Une boutique envoie une notification (titre, message et image optionnels) à une
**audience**, dans la limite du **quota de son plan**. Écran app :
Settings → Boutique → Notifications (`yaammoo/architecture/merchant-broadcast.md`).

Migrations : `053_fastfood_broadcasts.sql` (envois, plans, quota) et
`054_user_locations.sql` (audience « ville »). ⚠️ **Appliquer les deux avant
de déployer le code** : `settings.repo` lit `settings_notification` avec les
autres catégories.

## Routes

| Verbe | Path | Garde |
|---|---|---|
| GET | `/notification/broadcast/:fastFoodId` | `firebaseAuth` + `requireFastfoodPermission('notifications.send')` |
| POST | `/notification/broadcast/:fastFoodId` | idem |

Propriétaire et admin passent toujours ; un employé a besoin de
`notifications.send` (voir [staff.md](./staff.md)).

### GET — état de l'écran

```
{ success, data: {
  plan:   { key, label, dayLimit, weekLimit, audiences: ['customers' | 'city' | 'all'] },
  cities: string[],                 // villes desservies (fastfoods.cities)
  items:  [{ id, fastFoodId, title, body?, imageUrl?, audience, city?, plan,
             recipientsCount, pushedCount, sentAt }]   // plus récent d'abord
} }
```

`items` contient au moins `max(30, weekLimit)` envois : toute la semaine en
cours y est, le client en déduit barres et quota restant.

### POST — envoi

Payload (`interface/broadcastFields.js`, `validateBroadcast`) :

| Champ | Règle |
|---|---|
| `title` | requis, ≤ 50, non vide |
| `body` | ≤ 150 |
| `imageUrl` | URL `https://` (photo de menu, ou upload `folder=broadcasts`) |
| `audience` | `customers` · `city` · `all` |
| `city` | requise si `audience = city`, parmi les villes de la boutique |

| Code | Cas |
|---|---|
| 201 | `{ data: <envoi> }` — la diffusion part ensuite, en arrière-plan |
| 400 | payload invalide, ou ville non desservie |
| 403 | permission absente, ou audience non incluse dans le plan |
| 404 | boutique introuvable (ou supprimée) |
| 429 | quota du jour (`Quota du jour atteint.`) ou de la semaine atteint |

## Plans

Réglage `broadcast_plans` (table `settings_notification`, modifiable à chaud) :

```json
{ "free": { "label": "Gratuit", "dayLimit": 3, "weekLimit": 10,
            "audiences": ["customers", "city", "all"] } }
```

- Plan d'une boutique : `fastfoods.broadcast_plan` (`'free'` par défaut).
- Clé inconnue → plan `free` (un plan retiré ne coupe pas l'envoi).
- Aucun plan lisible → limites à 0 : envoi refusé, jamais illimité.
- Ajouter un plan payant = ajouter une clé au JSON, puis poser
  `broadcast_plan` sur la boutique. Aucun code à changer.

## Quota

- Jour : depuis minuit ; semaine : depuis lundi 00:00. Fuseau :
  `broadcast_utc_offset_minutes` (60 = Cameroun), calculé par
  `broadcastPlan.quotaWindow()`.
- `insert_fastfood_broadcast(...)` compte et insère **dans la même
  transaction**, sous `pg_advisory_xact_lock` propre à la boutique : deux envois
  simultanés ne franchissent pas le quota ensemble. Semaine vérifiée avant jour.
- `dayLeft` affiché par l'app = `min(dayLimit − jour, weekLimit − semaine)`.

## Audiences

| Audience | Destinataires | Fil de notifications |
|---|---|---|
| `customers` | `fastfood_customer_ids(id)` : commandes réelles dans la boutique (`pendingToBuy` exclu, annulations incluses) | fil personnel de chacun |
| `city` | `city_user_ids(ville)` : dernière ville connue (`users.location_city`, casse ignorée) ; sans localisation, villes des boutiques où le user a commandé | fil personnel de chacun |
| `all` | tous les users | **un** groupe `target='all'` au nom de la boutique, déjà servi à tout le monde |

L'expéditeur et le propriétaire sont exclus. Listes lues par pages de 1000
(plafond PostgREST).

## Diffusion (`services/notification/broadcast/broadcastFanout.js`)

Lancée par `setImmediate` après la réponse 201. Ne lève jamais.

1. Fil : `append_notification` par destinataire (8 en parallèle), ou un seul
   groupe pour `all`.
2. Push : tokens par lots de 200 users, envois par lots de 100 tokens,
   `imageUrl` transmise (voir [notifications.md](./notifications.md), Image).
   Tokens stales supprimés.
3. Socket `newNotification` : room du user, ou global pour `all`.
4. Bilan : `recipients_count`, `pushed_count` sur l'envoi.

Notification du fil :

```
{ id, title, body, type: 'boutique_broadcast', imageUrl?, shopId, shopName,
  route: '/(tabs)?shop=<nom encodé>', isRead: [], createdAt }
```

`shopId` et non `fastFoodId` : sur un groupe, `fastFoodId` désigne la boutique
**destinataire**, et `flattenNotifications` l'écraserait. Données du push
(chaînes uniquement) : `{ id, type, route, shopId, imageUrl }`.

## Fichiers

```
schema/migrations/053_fastfood_broadcasts.sql
schema/migrations/054_user_locations.sql              # city_user_ids
src/interface/broadcastFields.js
src/utils/validator/validateBroadcast.js
src/repositories/supabase/fastfoodBroadcasts.repo.js
src/services/notification/broadcast/broadcastPlan.js   # plan + bornes de quota
src/services/notification/broadcast/broadcast.service.js
src/services/notification/broadcast/broadcastFanout.js
src/controllers/notifications/broadcast/broadcast.controller.js
src/routes/notificationRoutes.js
```

## Limites connues

- iOS : image affichée seulement avec une Notification Service Extension dans
  l'app (absente à ce jour).
- Audience `all` : le groupe de la boutique est servi à tous par
  `GET /notification/user`, sans pagination ; le fil grossit avec les envois.
