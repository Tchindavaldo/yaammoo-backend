# Analytics — statistiques d'usage

Consultation **réservée à l'admin**. Migration : `061_analytics.sql`.

## Sources

| Donnée | Qui l'écrit | Table |
|---|---|---|
| Connexions (qui, quand, combien, en ligne) | backend, socket `join_user` / `disconnect` (`services/analytics/presence.service.js`) | `analytics_connections` |
| Sessions (ouverture de l'app, durée, appareil) | app, `POST /analytics/events` | `analytics_sessions` |
| Événements (scroll du home, boutiques vues, entonnoir, recherches, bannières, écrans) | app, `POST /analytics/events` | `analytics_events` |

**Présence** : une ligne `analytics_connections` par (socket, userId). Sans
`disconnected_at` = en ligne. `server_id` = `FLY_MACHINE_ID` (sinon hostname) ;
au démarrage, les lignes restées ouvertes de la machine sont fermées. Un
`join_user` avec un id qui n'est pas un user (room boutique) est ignoré (FK).
L'app peut passer `appVersion` / `platform` dans la query du handshake socket.

## POST /analytics/events (`firebaseAuth`)

L'utilisateur est celui du Bearer. Champs : `interface/analyticsFields.js`,
validation `validateAnalyticsBatch`. Au plus 200 événements par lot.

```json
{
  "session": { "id", "startedAt", "lastActivityAt?", "endedAt?", "appVersion?", "platform?", "osVersion?", "deviceModel?" },
  "events": [{ "type", "occurredAt", "fastFoodId?", "menuId?", "bannerId?", "data?" }]
}
```

| `type` | Id porté | `data` |
|---|---|---|
| `screen_view` | — | `screen`, `durationMs` (temps passé, envoyé en quittant l'écran) |
| `home_page_loaded` | — | `page` (1 = première), `itemsCount`, `msSincePrevious` |
| `shop_impression` | `fastFoodId` | `position`, `page`, `visibleMs` (boutique visible ≥ 50 %) |
| `shop_open` | `fastFoodId` | `source` : home · search · banner · notification · other |
| `menu_open` | `fastFoodId`, `menuId` | — |
| `add_to_cart` | `fastFoodId`, `menuId` | `quantity` |
| `checkout_start` | `fastFoodId` | `total` |
| `payment_result` | — | `status` : success · failed, `total` |
| `search` | — | `query`, `resultsCount` |
| `banner_view` / `banner_click` | `bannerId` | — |

**Champs calculés** :
- `analytics_sessions.duration_ms` = `(endedAt ?? lastActivityAt) − startedAt`, avec
  `lastActivityAt` = max(startedAt, lastActivityAt, occurredAt des événements).
- Heures du téléphone hors [−7 j, +5 min] → heure serveur (`resolveCapturedAt`).

Réponses : 201 `{ data: { received } }`, 400, 401, 404 (user absent).

## Lecture admin (`firebaseAuth` + `authorize(adminOnly)`)

Query commune : `from`, `to` (ISO, défaut 30 derniers jours), `limit` (défaut 100, max 1000).

| Route | Renvoie |
|---|---|
| `GET /analytics/online` | `{ count, users[{ userId, since, devices, appVersion, platform }] }` |
| `GET /analytics/connections?userId` | historique des connexions |
| `GET /analytics/connections/stats` | par user : `connectionCount`, `firstConnectedAt`, `lastConnectedAt`, `totalConnectedS`, `online` |
| `GET /analytics/sessions/stats` | par user : `sessions`, `totalMs`, `avgMs`, `lastSessionAt` |
| `GET /analytics/home-scroll` | par user : `pagesLoaded`, `maxPage`, `shopsSeen` (distinctes), `avgMsBeforeNextPage` |
| `GET /analytics/shops` | par boutique : `impressions`, `viewers`, `avgVisibleMs`, `opens`, `menuOpens`, `addToCart` |
| `GET /analytics/funnel` | `step` (shop_open → menu_open → add_to_cart → checkout_start → payment_success / payment_failed), `users`, `events` |
| `GET /analytics/searches` | `query`, `searches`, `users`, `zeroResults` |
| `GET /analytics/banners` | `bannerId`, `views`, `clicks`, `viewers`, `clickers` |
| `GET /analytics/daily` | par jour (Douala, jours vides inclus) : `day`, `activeUsers`, `sessions`, `totalMs`, `connections`, `homePages`, `impressions`, `shopOpens`, `addToCart`, `checkouts`, `paymentsSuccess`, `searches` |
| `GET /analytics/events?userId&type&fastFoodId` | événements bruts |
| `GET /analytics/users/:userId` | `connectionCount`, `lastConnectedAt`, `online`, `sessions[]`, `homeScroll`, `events[]` |

Toute ligne portant un `userId` reçoit aussi `user { name, email, phone }`
(`users.getUserIdentities`, `null` si le user n'existe plus).

Agrégats = fonctions SQL `analytics_*` de la migration 061.
