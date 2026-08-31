# Feature — Merchants (Gestion Boutique)

## Rôle

Gestion des fastfoods (boutiques marchand) : création, édition infos boutique, configuration heures de livraison, paiements OM. Accessible après création d'une boutique (qui assignet `fastFoodId` au user).

---

## Routes

| Méthode | Endpoint                               | Contrôleur                           | Rôle                                                                   |
| ------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| POST    | `/fastfood`                            | `createFastFood`                     | Crée une nouvelle boutique                                             |
| GET     | `/fastfood/:id`                        | `getFastFoodById`                    | Récupère les infos d'une boutique                                      |
| POST    | `/fastfood/:id`                        | `updateFastFood`                     | Édite infos boutique — **propriétaire ou admin** (voir ci-dessous)     |
| GET     | `/menu/:fastFoodId`                    | `getMenusByFastFood`                 | Récupère tous les menus d'une boutique                                 |
| GET     | `/fastFood/:fastFoodId/delivery-stats` | `getFastFoodDeliveryStatsController` | Stats auto-livraison du fastFood (scope `self`/`client`, auth requise) |
| POST    | `/menu`                                | `createMenu`                         | Ajoute un menu à une boutique                                          |
| PUT     | `/menu/:id`                            | `updateMenu`                         | Édite un menu                                                          |
| DELETE  | `/menu/:id`                            | `deleteMenu`                         | Supprime un menu                                                       |
| DELETE  | `/fastFood/admin`                      | `deleteFastfoodsController`          | **Admin** — supprime N boutiques (soft delete). Voir ci-dessous        |
| GET     | `/fastFood/admin/deleted`              | `listDeletedFastfoodsController`     | **Admin** — corbeille (`deletedAt`, `daysUntilPurge`)                  |
| POST    | `/fastFood/admin/:fastFoodId/restore`  | `restoreFastfoodController`          | **Admin** — annule une suppression avant la purge                      |
| POST    | `/fastFood/admin/purge`                | `purgeDeletedFastfoodsController`    | **Admin** — force l'effacement définitif des boutiques expirées        |

---

## Structure de données

### FastFood (Boutique)

```typescript
FastFood {
  id: string                    // UUID
  userId: string               // UID du propriétaire (créateur)
  name: string                 // Nom boutique
  number: string               // Numéro téléphone principal
  momoNumber: string           // Numéro Mobile Money (OM/Momo)
  whatsappNumber: string       // Numéro WhatsApp
  openTime: "HH:mm"           // Heure ouverture (ex: "09:00")
  closeTime: "HH:mm"          // Heure fermeture (ex: "22:00")
  image: string                // URL image (Supabase storage)

  // Livraison
  orderLeadTime: number        // Délai avant livraison (minutes)
                               // Clients ne peuvent pas commander
                               // après minuit - orderLeadTime
  advanceDays: number          // Nombre de jours à l'avance pour commander (défaut: 0)
  pickupAllowed: boolean       // true = le client peut venir récupérer sur place.
                               // N'exclut PAS la livraison : une boutique qui
                               // ne livre pas ne déclare aucune zone.
  cities: string[]             // Villes où la boutique opère (ex: ["Douala", "Yaoundé"])
  deliveryHours: DeliveryHour[] // Créneaux avec zones de livraison et prix
  // Qui livre — décidé par l'ADMIN, jamais par la boutique (migration 037).
  deliveryBy: 'fastfood' | 'platform'
  // Zones de la PLATEFORME, même forme que deliveryHours (periodicZones ET
  // expressZones). Utilisées seulement quand deliveryBy = 'platform'.
  platformDeliveryZones: DeliveryHour[]

  // Métadonnées
  createdAt: ISO8601
  updatedAt: ISO8601
}

DeliveryHour {
  hour: string                 // Créneau horaire (ex: "08:00")
  periodic: boolean            // Livraison périodique disponible
  periodicZones: Zone[]        // Zones et prix pour livraison périodique
  express: boolean             // Livraison express disponible
  expressZones: Zone[]         // Zones et prix pour livraison express
}

Zone {
  lieu: string                 // Lieu/quartier (ex: "Bonanjo")
  prix: string                 // Prix de livraison (ex: "500")
}
```

### Menu (Article boutique)

```typescript
Menu {
  id: string
  fastFoodId: string           // Référence FastFood
  name: string                 // Nom plat
  titre: string                // Titre (variante du name?)

  // Prix — ⚠️ c'est `prices[]` qui fait foi ; prix1/prix2/prix3 sont des
  // colonnes obsolètes, NULL sur toute la base. Cf. menus-detailed.md
  prices: { price: number, description: string }[]

  // Images
  image: string                // Image principale
  coverImage: string           // Image cover
  images: string[]             // Galerie

  // Stock & disponibilité
  stock: number                // Quantité disponible
  disponibilite: boolean       // En vente ou non
  status: string               // 'available', 'sold_out', etc.

  // Extras
  extra: MenuItem[]            // Suppléments (ex: sauce, épices)
  drink: MenuItem[]            // Boissons associées

  createdAt: ISO8601
  updatedAt: ISO8601
}

MenuItem {
  label: string
  price: number
  [key]: any                   // Champs libres
}
```

---

## Flux clé

### Création de boutique

1. Frontend : POST `/fastfood` avec :

   ```json
   {
     "userId": "uid-user",
     "name": "Le Coin du Bien Manger",
     "number": "78976543",
     "openTime": "09:00",
     "closeTime": "22:00"
   }
   ```

2. Backend : `createFastfoodService()` :
   - Valide données (validateFastfood)
   - Vérifie unicité : user peut avoir qu'1 boutique
   - Crée doc fastfoods
   - **Met à jour user** : `repos.users.updateUser(userId, { fastFoodId, isMarchand: true })`
   - Émet socket `newFastfood`

3. Frontend :
   - AuthContext recharge user → `isMarchand: true` maintenant ✅
   - Settings affiche section "Boutique" ✅

### Édition boutique (heures livraison)

1. Frontend (EditBoutiquePanel) :
   - GET `/fastfood/:fastFoodId` → charge config actuelle
   - User ajoute/supprime créneaux dans `deliveryHours[]`
   - POST `/fastfood/:fastFoodId` avec body :
     ```json
     {
       "name": "...",
       "deliveryHours": [
         {
           "hour": "08:00",
           "periodic": true,
           "periodicZones": [{ "lieu": "Bonanjo", "prix": "500" }],
           "express": false,
           "expressZones": []
         }
       ],
       "orderLeadTime": 30,
       "advanceDays": 3,
       "pickupAllowed": false,
       "cities": ["Douala", "Yaoundé"],
       "momoNumber": "691234568",
       "whatsappNumber": "691234569"
     }
     ```

2. Backend : `updateFastfoodService()` :
   - Whitelist champs autorisés (nom, openTime, closeTime, image, deliveryHours, orderLeadTime…)
   - `deliveryBy` / `platformDeliveryZones` : **hors de cette route**. Réservés à
     l'ADMIN via `PATCH /fastFood/:fastFoodId/delivery` (ou `/fastFood/delivery`
     pour tout le parc) — une boutique ne décide pas qui la livre ni à quel
     tarif. Voir [pricing-delivery-modes.md](./pricing-delivery-modes.md#configurer-qui-livre-routes-admin)
   - Nettoie `deliveryHours` via `utils/deliveryHoursSanitize.js` (voir ci-dessous)
   - Met à jour doc fastfoods
   - Émet socket `fastfoodUpdated` (broadcast global)

   **Nettoyage des créneaux à l'écriture (OBLIGATOIRE)**

   Le front renvoie à chaque enregistrement toutes ses lignes d'heures locales,
   y compris celles créées puis vidées. Constaté en prod sur `8KqUta86xe9fvihWnkzd` :
   8 créneaux stockés dont 5 sans aucune zone (`express: true`, `expressZones: []`),
   donc sans prix — invisibles pour `services/pricing/deliveryPricing.js` qui ne
   compte que les zones.

   `sanitizeDeliveryHours()` ne conserve donc un créneau que s'il a **au moins un
   mode actif pourvu de zones valides** :
   - `express: true` **et** `expressZones` contient au moins une zone valide, **ou**
   - `periodic: true` **et** `periodicZones` contient au moins une zone valide.

   Un mode désactivé est légitime : une boutique peut ne faire que de l'express.
   Une zone est valide si `lieu` est une string non vide **et** `Number(prix) > 0`
   (le front envoie `prix` en string, ex. `"500"`). Les zones invalides sont aussi
   purgées des créneaux conservés. Le format legacy (strings `"HH:mm"`) traverse
   intact : il ne porte aucune zone.

3. Frontend :
   - Affiche confirmation "Boutique mise à jour"
   - Client verra créneaux lors du checkout

### Gestion des menus

1. Marchand ajoute menu : POST `/menu`

   ```json
   {
     "fastFoodId": "...",
     "name": "Poulet Grillé",
     "prices": [{ "price": 2500, "description": "Petit" }],
     "stock": 50,
     "disponibilite": true
   }
   ```

2. Backend : `createMenuService()` → crée doc menus

3. Client voit menu au chargement de boutique

---

## Services & Repositories

**fastfoodService.js**

- `createFastfood(data)` — création + update user + socket emit
- `getFastfoodById(id)` — récupère boutique
- `updateFastfood(id, data)` — édition boutique

**menuService.js**

- `createMenu(data)`
- `getMenusByFastFood(fastFoodId)`
- `updateMenu(id, data)`
- `deleteMenu(id)`

**repos.fastfoods** & **repos.menus** : Implémentés en Supabase

---

## Validations

**FastFood**

- userId : non-vide, valide
- name : 3+ caractères
- number : format téléphone valide
- openTime, closeTime : format "HH:mm"
- deliveryHours : array d'objets DeliveryHour

**Menu**

- name : 3+ caractères
- prices : au moins une entrée, chaque `price` > 0
- stock : >= 0
- fastFoodId : référence existante

---

## Workflow complet (une nouvelle boutique)

```
User (client) → appuie "devenir marchand"
  ↓
Register → s'enregistre avec isMarchand:false
  ↓
Settings → crée boutique : POST /fastfood
  ↓
Backend → crée doc fastfoods + met à jour user.fastFoodId + user.isMarchand:true
  ↓
Frontend → AuthContext recharge user
  ↓
Settings → section "Boutique" apparaît maintenant ✅
  ↓
Marchand → clique "Gérer ma boutique" → EditBoutiquePanel
  ↓
Édite nom, heures, créneaux livraison → POST /fastfood/:id
  ↓
Frontend → confirmation ✅
```

---

## Compatibilité versions app — `deliveryHours`

Deux formats coexistent en base (`delivery_hours` JSON) :

- **legacy (app 1.0.0)** : `["10:00", "14:00"]` (tableau de strings)
- **new (app 1.0.1+)** : `[{ hour: "13:06", express, periodic, expressZones, periodicZones }]` (objets enrichis)

L'app 1.0.0 plante (`hour.split is not a function`) si on lui sert des objets.
Le backend **downgrade** donc vers le format legacy selon le client appelant.

**Détection de la version** — utilitaire générique `src/utils/appVersion.js`
(`resolveClientVersion`, `clientVersionAtLeast`) ; la transformation deliveryHours
vit dans `src/utils/deliveryHoursFormat.js` qui s'appuie dessus :

1. Header `x-app-version` (prioritaire) — version réelle du client.
2. Fallback `FRONTEND_APP_VERSION` (.env, défaut `1.0.0`) si aucun header.

La version résolue est comparée à `APP_DELIVERY_NEW_MIN_VERSION` (1.0.1) :
< 1.0.1 → format legacy (strings) ; >= 1.0.1 → format new (objets).

`FRONTEND_APP_VERSION` est générique et réutilisable pour tout futur endpoint
devant adapter sa réponse selon la version de l'app.

**Appliqué dans** : `getFastFoods` (liste home) et `getFastFood` (détail).
Au déploiement de la 1.0.1, passer `FRONTEND_APP_VERSION=1.0.1`.

---

## Qui peut modifier une boutique

`POST /fastFood/:fastFoodId` est protégée par `firebaseAuth` +
`fastfoodOwnerGuard` (`middlewares/fastfoodOwnerMiddleware.js`) :

| Demandeur | Accès |
| --- | --- |
| Propriétaire (`fastfood.userId === uid`) | ✅ |
| **Admin plateforme** (`isAdmin`) | ✅ — n'importe quelle boutique, sans en être propriétaire |
| Tout autre user authentifié | ❌ 403 |
| Non authentifié | ❌ 401 |

> ⚠️ **Cette route était PUBLIQUE.** Aucun `firebaseAuth`, et aucun contrôle de
> propriété ni dans le controller ni dans le service : n'importe qui, sans même
> être connecté, pouvait renommer une boutique, changer son numéro Mobile Money
> ou vider ses créneaux de livraison. Corrigé — les clients front qui appelaient
> cette route sans token doivent désormais envoyer leur Bearer.

L'admin passe sans lecture préalable de la boutique : c'est le service qui
renvoie 404 si elle n'existe pas.

---

## Suppression admin d'une boutique (soft delete)

`DELETE /fastFood/admin` — réservé aux administrateurs (`firebaseAuth` + `adminGuard`).
Migration `047_soft_delete_fastfood.sql`.

### Pourquoi soft et pas DELETE

Supprimer une boutique emporte ses menus, ses commandes et ses notifications. Un
DELETE réel rend l'erreur définitive : un mauvais id saisi, et l'historique d'une
boutique active est perdu. Les lignes sont donc **marquées** `deleted_at`, puis
effacées après `FASTFOOD_DELETE_RETENTION_DAYS` jours (30). Entre les deux,
`POST /fastFood/admin/:fastFoodId/restore` annule tout.

### Payload

```json
{
  "fastFoodIds": ["id1", "id2"],
  "scopes": ["menus", "orders", "notifications"]
}
```

| Champ         | Obligatoire | Valeurs                                                                       |
| ------------- | ----------- | ----------------------------------------------------------------------------- |
| `fastFoodIds` | oui         | Au moins un id. Le lot est traité id par id (`deleted` / `skipped`).          |
| `scopes`      | **oui**     | `"all"`, ou un tableau parmi `menus`, `orders`, `notifications`, `bonus`, `drivers`, `support`, `deliveries` |

> ⚠️ **`scopes` n'a pas de valeur par défaut.** L'omettre renvoie 400, jamais une
> suppression totale : un « tout » implicite est précisément l'accident que ce
> endpoint doit rendre impossible. `"all"` reste possible, mais explicitement écrit.

La boutique elle-même (`fastfoods`) part toujours — c'est l'objet de l'appel — et
`users.fastfood_id` est vidé, ce qui suffit à retirer le statut marchand (`isMarchand`
est dérivé, cf. R5).

### Données JAMAIS supprimables

`withdrawals`, `order_settlements`, `platform_revenues`, `transactions` sont des
**pièces comptables** : elles survivent à la boutique. Les demander explicitement
dans `scopes` renvoie 400 — ce n'est pas un oubli, c'est un refus.

### Réponse

```json
{
  "deleted": [{ "id": "...", "deletedAt": "...", "counts": { "menus": 12, "orders": 340 } }],
  "skipped": [{ "id": "...", "reason": "Boutique introuvable ou déjà supprimée." }],
  "scopes": ["menus", "orders"],
  "retentionDays": 30
}
```

Statut `207` si le lot est partiellement appliqué, `200` sinon.

### Effet sur les lectures

Toutes les lectures courantes filtrent `deleted_at IS NULL` — la boutique
disparaît du home, du catalogue et des listes de commandes **immédiatement**,
sans attendre la purge :

| Fichier | Lectures filtrées |
| --- | --- |
| `fastfoods.repo.js` | `getById`, `getAll`, `getPage` (+ jointure `menus`), `getByUserId`, `searchByName`, `exists` |
| `menus.repo.js` | `getByFastFood` |
| `orders.repo.js` | `getByFastFood`, `getByUser`, `getByDriver`, `query` |

Pour LIRE une boutique supprimée (écrans d'admin), passer par
`fastfoodDeletion.repo.js`, qui ne filtre pas.

Socket : `fastfoodsDeleted` `{ ids: string[] }` (broadcast global) pour que le
front retire les boutiques sans refresh.

### Purge définitive

`utils/fastfoodPurgeJob.js`, toutes les `FASTFOOD_PURGE_INTERVAL_MS` (24h).
Efface les lignes ET les images du bucket (boutique + `image`, `cover_image`,
`images[]` de chaque menu). Postgres n'ayant pas accès au storage, la fonction SQL
renvoie les URL et c'est le service Node qui les supprime ; une image qui résiste
n'annule pas la purge (signalée dans `imageErrors`).

`menus` et `bonus` sont passés de `ON DELETE CASCADE` à `RESTRICT` : une cascade
court-circuiterait la rétention de 30 jours.

### Réglages — en BASE, pas en `.env`

Table `settings_deployment` (migration 048), modifiables à chaud via
`PATCH /settings/:key` — allonger la rétention pour sauver une boutique dont les
30 jours expirent ne doit pas demander un redéploiement.

| Clé | Défaut | Repli si absente | Rôle |
| --- | --- | --- | --- |
| `fastfood_delete_retention_days` | `30` | **`90`** | Jours avant effacement définitif |
| `fastfood_purge_interval_ms` | `86400000` | `86400000` | Intervalle du job de purge (`0` = désactivé) |

> Le repli de la rétention est **plus long** que le défaut, volontairement : une
> clé illisible ne doit jamais purger plus tôt que prévu. Effacer trop tôt est
> irréversible, effacer trop tard ne coûte que du stockage.

L'intervalle est relu à **chaque tour** du job (`setTimeout` réarmé, pas
`setInterval`) : le changer en base se propage sans redémarrer le process.

### Limite connue — restauration

`restore` ne réattribue **pas** `users.fastfood_id` : entre-temps le propriétaire
a pu créer une autre boutique, et écraser ce lien lui en ferait perdre une. La
réponse porte `ownerReattached: false` — le rattachement se fait à la main.

---

## Erreurs couantes

- 400 : Cet utilisateur possède déjà une fastfood
- 404 : Fastfood / Menu non trouvé
- 400 : Validation échouée (champs manquants ou invalides)
