# Feature — Merchants (Gestion Boutique)

## Rôle

Gestion des fastfoods (boutiques marchand) : création, édition infos boutique, configuration heures de livraison, paiements OM. Accessible après création d'une boutique (qui assignet `fastFoodId` au user).

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/fastfood` | `createFastFood` | Crée une nouvelle boutique |
| GET | `/fastfood/:id` | `getFastFoodById` | Récupère les infos d'une boutique |
| POST | `/fastfood/:id` | `updateFastFood` | Édite infos boutique (nom, heures, OM…) |
| GET | `/menu/:fastFoodId` | `getMenusByFastFood` | Récupère tous les menus d'une boutique |
| GET | `/fastFood/:fastFoodId/delivery-stats` | `getFastFoodDeliveryStatsController` | Stats auto-livraison du fastFood (scope `self`/`client`, auth requise) |
| POST | `/menu` | `createMenu` | Ajoute un menu à une boutique |
| PUT | `/menu/:id` | `updateMenu` | Édite un menu |
| DELETE | `/menu/:id` | `deleteMenu` | Supprime un menu |

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
   - Met à jour doc fastfoods
   - Émet socket `fastfoodUpdated` (broadcast global)

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

## Erreurs couantes

- 400 : Cet utilisateur possède déjà une fastfood
- 404 : Fastfood / Menu non trouvé
- 400 : Validation échouée (champs manquants ou invalides)
