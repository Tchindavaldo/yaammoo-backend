# Feature — Menus (Catalogue Produits Marchand)

## Rôle

Gestion complète des menus (articles) : création, édition, suppression, gestion stock, disponibilité. Client voit menus au chargement d'une boutique.

---

## Routes

| Méthode | Endpoint                 | Contrôleur                 | Rôle                                                           |
| ------- | ------------------------ | -------------------------- | -------------------------------------------------------------- |
| POST    | `/menu`                  | `createMenu`               | Ajoute menu à boutique                                         |
| GET     | `/menu/:fastFoodId`      | `getMenusByFastFood`       | Liste menus d'une boutique                                     |
| GET     | `/menu/:id`              | `getMenuById`              | Détail menu (avec images, extras)                              |
| PUT     | `/menu/:id`              | `updateMenu`               | Édite menu (prix, stock, dispo)                                |
| DELETE  | `/menu/:id`              | `deleteMenu`               | Supprime menu                                                  |
| PATCH   | `/menu/:id/stock`        | `updateMenuStock`          | Décrément stock (après commande)                               |
| PATCH   | `/menu/:id/availability` | `toggleMenuAvailability`   | On/off disponibilité                                           |
| POST    | `/menu/:id/rating`       | `rateMenuController`       | Noter un plat (client livré) — voir [ratings.md](./ratings.md) |
| GET     | `/menu/:id/ratings`      | `getMenuRatingsController` | Liste des avis d'un plat                                       |

> **Notes plat** : chaque menu porte `ratingAvg` + `ratingCount` (pré-calculés, colonnes
> `menus.rating_avg/count`). Détail du système : [ratings.md](./ratings.md).

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

  // Tarification — ⚠️ c'est `prices[]` qui fait foi
  prices: { price: number, description: string }[]
                                // ex: [{price:2500, description:"Petit"},
                                //      {price:3000, description:"Grand"}]
                                // `orders.selectedPriceIndex` = index retenu

  // ⚠️ OBSOLÈTES — colonnes présentes dans le mapper Supabase, mais NULL sur
  // toute la base. Ne pas les lire, ne pas les écrire.
  prix1 / prix2 / prix3 : number
  optionPrix1 / optionPrix2 / optionPrix3 : string

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
     "prices": [
       { "price": 2500, "description": "Petit" },
       { "price": 3500, "description": "Moyen" }
     ],
     "stock": 50,
     "disponibilite": true,
     "extra": [
       { "label": "Sauce piquante", "price": 500 },
       { "label": "Sauce douce", "price": 500 }
     ],
     "drink": [{ "label": "Jus", "price": 1500 }]
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
- prices : au moins une entrée, chaque `price` > 0
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


---

## Vignettes d'images (servies au client)

Les fichiers stockés sont en pleine résolution (300 Ko à 1,1 Mo) alors que les
cartes du home les affichent dans des zones de 130 à 260 px. Le backend sert
donc au client des **URLs de vignettes** Supabase (`/render/image/public/`),
l'original restant intact et accessible.

| Fichier | Rôle |
|---|---|
| `src/services/images/thumbnailUrl.js` | `optimizedUrl(url)` + `withMenuThumbnails(menu)` + `withBannerThumbnail(banner)` |

**Aucun redimensionnement** : les dimensions d'origine sont conservées, seul le
format change.

> ⚠️ `width` seul **déforme** l'image : Supabase force la largeur sans ajuster
> la hauteur. Une image 500x503 devenait 400x503 — ratio 0,99 → 0,79. Passer
> aussi `height` + `resize=contain` corrigerait, mais pour 2 Ko de gain sur 23 :
> le WebP seul suffit.

**Mesures** : 327 Ko → 23 Ko (-93 %) à dimensions identiques ; bannière 648 Ko →
~90 Ko. `format=webp` est le seul levier qui compte — beaucoup d'originaux sont
des PNG, insensibles à `quality`, et le préfixe `/render/image/` **seul ne
réduit rien** (327 Ko → 327 Ko).

**Où c'est appliqué** — uniquement sur les chemins CLIENT :
- `getFastFoods.js` → `/fastfood/all` (menus du catalogue)
- `controllers/fastfood/getFastFoods.js` → bannières du carrousel
- `enrichMenuForClient.js` → émissions socket `globalMenuUpdated` / `newGlobalMenu`

> ⚠️ **Jamais sur le chemin MARCHAND** (`GET /menu/:fastFoodId`). Le marchand
> édite son catalogue : lui servir une URL transformée la ferait réenregistrer
> en base au prochain `PUT /menu`, corrompant la donnée de façon irréversible.

**Garde-fou projet** : la réécriture n'est appliquée que sur les hôtes listés
dans `TRANSFORM_ENABLED_HOSTS` (plan Pro). Sur un projet gratuit,
`/render/image/` répond 403 `FeatureNotEnabled` et l'image ne s'afficherait pas.
