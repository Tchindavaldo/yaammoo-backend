# Feature — Menus (Catalogue Produits Marchand)

## Rôle

Gestion complète des menus (articles) : création, édition, suppression, gestion stock, disponibilité. Client voit menus au chargement d'une boutique.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/menu` | `createMenu` | Ajoute menu à boutique |
| GET | `/menu/:fastFoodId` | `getMenusByFastFood` | Liste menus d'une boutique |
| GET | `/menu/:id` | `getMenuById` | Détail menu (avec images, extras) |
| PUT | `/menu/:id` | `updateMenu` | Édite menu (prix, stock, dispo) |
| DELETE | `/menu/:id` | `deleteMenu` | Supprime menu |
| PATCH | `/menu/:id/stock` | `updateMenuStock` | Décrément stock (après commande) |
| PATCH | `/menu/:id/availability` | `toggleMenuAvailability` | On/off disponibilité |

---

## Structure de données

```typescript
Menu {
  id: string                    // UUID
  fastFoodId: string            // Référence boutique propriétaire
  
  // Identification
  name: string                  // Nom plat (ex: "Poulet Grillé")
  titre: string                 // Titre alternatif (?)
  description: string           // Description longue
  
  // Tarification (3 variantes possibles)
  prix1: number                 // Prix base
  prix2: number                 // Variante 2 (ex: moyen)
  prix3: number                 // Variante 3 (ex: grand)
  optionPrix1: string           // Label variante 1 (ex: "Petit")
  optionPrix2: string           // Label variante 2 (ex: "Moyen")
  optionPrix3: string           // Label variante 3 (ex: "Grand")
  
  // Images
  image: string                 // Image principale (URL Supabase)
  coverImage: string            // Image cover/hero
  images: string[]              // Galerie additionnelle
  
  // Stock & disponibilité
  stock: number                 // Quantité disponible
  disponibilite: boolean        // En vente (on/off par marchand)
  status: 'available' | 'sold_out' | 'hidden' | 'discontinued'
  
  // Suppléments & boissons
  extra: MenuItem[]             // Suppléments (sauce, épices, taille)
  drink: MenuItem[]             // Boissons associées
  
  // Métadonnées
  createdBy: string             // UID marchand propriétaire
  
  createdAt: ISO8601
  updatedAt: ISO8601
}

MenuItem {
  label: string                 // Nom suppléments (ex: "Sauce piquante")
  price: number                 // Prix additionnel
  [key]: any                    // Champs libres (optional, quantity, etc.)
}
```

---

## Flux clés

### Création menu (Marchand)

1. Marchand (MenuManagePanel) : POST `/menu`
   ```json
   {
     "fastFoodId": "...",
     "name": "Poulet Grillé",
     "prix1": 2500,
     "prix2": 3500,
     "optionPrix1": "Petit",
     "optionPrix2": "Moyen",
     "stock": 50,
     "disponibilite": true,
     "extra": [
       { "label": "Sauce piquante", "price": 500 },
       { "label": "Sauce douce", "price": 500 }
     ],
     "drink": [
       { "label": "Jus", "price": 1500 }
     ]
   }
   ```

2. Backend : `createMenuService()`
   - Valide données (validateMenu)
   - Crée doc menus
   - Optionnellement upload image vers Supabase storage

3. Frontend : affiche confirmation

### Chargement boutique (Client)

1. Client : GET `/boutique/123`
2. Backend : retourne FastFood + GET `/menu/123` (tous menus dispo)
3. Frontend : affiche catalogue avec prix, images, extras

### Édition stock (après commande)

1. Après commande confirmée : PATCH `/menu/:id/stock`
   ```json
   { "decrementBy": 1 }
   ```
2. Backend : décrémente stock, mets à jour statut si stock = 0

### Toggle disponibilité (Marchand on/off)

1. Marchand : PATCH `/menu/:id/availability`
   ```json
   { "disponibilite": false }
   ```
2. Backend : mets à jour, client ne voit plus menu

---

## Services & Repositories

**menuService.js**
- `createMenu(data)` — crée menu + upload image
- `getMenusByFastFood(fastFoodId)` — liste menus disponibles
- `getMenuById(id)` — détail complet
- `updateMenu(id, data)` — édite infos
- `deleteMenu(id)` — supprime
- `updateMenuStock(id, decrementBy)` — gère stock
- `toggleMenuAvailability(id, disponibilite)` — on/off

**repos.menus** : Firestore/Supabase

---

## Stock management

**Logique** :
- Stock initial : défini par marchand
- Après chaque commande : décrémenté de 1 (ou qty commandée)
- Stock = 0 → `status: 'sold_out'`
- Marchand peut réaprovisionner : PUT `/menu/:id` avec nouveau stock

**Problème concurrent** :
- 2 clients achètent en même temps stock=1
- Solution : transaction DB (Firestore) ou atomic update (Supabase)

---

## Validations

- name : 3+ caractères
- prix1 : > 0
- stock : >= 0
- fastFoodId : référence boutique existante
- images : format URL valide (Supabase)
- extra/drink : array d'objets avec label + price

---

## Checkout integration

À la création de commande :

```typescript
// Valider stock AVANT créer commande
const menu = await getMenuById(menuId);
if (menu.stock < quantityDesired) {
  throw new Error('Stock insuffisant');
}

// Créer commande
const order = await createOrder({
  menuId,
  quantity: quantityDesired,
  extras: selectedExtras,  // IDs des extras choisis
  drink: selectedDrink,
  ...
});

// Décrémenter stock APRÈS confirmation
await updateMenuStock(menuId, quantityDesired);
```

---

## Erreurs courantes

- 404 : Menu non trouvé
- 400 : Données invalides
- 409 : Stock insuffisant
- 403 : Marchand non propriétaire (edit autre marchand)
