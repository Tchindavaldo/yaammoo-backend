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
  number: string               // Numéro Orange Money (OM)
  openTime: "HH:mm"           // Heure ouverture (ex: "09:00")
  closeTime: "HH:mm"          // Heure fermeture (ex: "22:00")
  image: string                // URL image (Supabase storage)
  
  // Livraison
  orderLeadTime: number        // Délai avant livraison (minutes)
                               // Clients ne peuvent pas commander 
                               // après minuit - orderLeadTime
  deliveryHours: string[]      // Créneaux dispo (ex: ["12:00", "14:30", "19:00"])
  
  // Métadonnées
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

### Menu (Article boutique)

```typescript
Menu {
  id: string
  fastFoodId: string           // Référence FastFood
  name: string                 // Nom plat
  titre: string                // Titre (variante du name?)
  
  // Prix (3 variantes possibles)
  prix1: number
  prix2: number
  prix3: number
  optionPrix1: string
  optionPrix2: string
  optionPrix3: string
  
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
       "deliveryHours": ["12:00", "14:30", "19:00"],
       "orderLeadTime": 30
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
     "prix1": 2500,
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

**repos.fastfoods** & **repos.menus** : Implémentés en Firestore et Supabase

---

## Validations

**FastFood**
- userId : non-vide, valide
- name : 3+ caractères
- number : format OM valide
- openTime, closeTime : format "HH:mm"
- deliveryHours : array de "HH:mm"

**Menu**
- name : 3+ caractères
- prix1 : > 0
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

## Erreurs couantes

- 400 : Cet utilisateur possède déjà une fastfood
- 404 : Fastfood / Menu non trouvé
- 400 : Validation échouée (champs manquants ou invalides)
