# Banners — Carrousel publicitaire du home

## Rôle

Bannières publicitaires affichées en carrousel sur le home de l'app. Globales
(plateforme entière, pas liées à une boutique). Servies au client via
`GET /fastfood/all` (`data.banners`) pour que le home n'ait qu'un seul appel.

## Table `banners` (migration 044)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | TEXT PK | id généré (`generateId`) |
| `title` | TEXT | libellé optionnel |
| `image_url` | TEXT NOT NULL | URL publique Supabase storage (upload via `POST /image/upload`) |
| `type` | TEXT CHECK (`bonus`\|`none`) | action au clic |
| `target_id` | TEXT | si `type='bonus'`, id du bonus à ouvrir ; sinon NULL |
| `active` | BOOLEAN | masqué ou non au home |
| `sort_order` | INTEGER | position dans le carrousel |

Index : `(active, sort_order)` pour la lecture au home.

## Réordonnancement automatique

Le carrousel garde une séquence **contiguë 0..n-1**. À chaque mutation
(create/update/delete), le service re-indexe la liste en mémoire puis ré-écrit
l'ordre. Si l'admin donne un `sort_order` déjà pris (ou au-delà), les suivants
sont décalés — aucun doublon possible.

- `create` à la position `p` : les éléments `>= p` reculent de 1.
- `update` avec `sortOrder` : l'élément est déplacé à `p`, séquence re-plate.
- `update` sans `sortOrder` : position conservée.
- `delete` : purge automatique de l'image associée de Supabase Storage (`deleteImageFromSupabase`) et resserrement des survivants.

## Endpoints

| Verbe | Path | Auth | Rôle |
|---|---|---|---|
| GET | `/banner` | public | bannières **actives** (home) |
| GET | `/banner/all` | admin | toutes (dont inactives) |
| POST | `/banner` | admin | **upload + création en UN appel** (multipart, champ `image`) |
| PATCH | `/banner/:id` | admin | modifier / déplacer / remplacer l'image |
| DELETE | `/banner/:id` | admin | supprime la bannière ET purge son image de Supabase Storage |
| DELETE | `/image` | public* | supprime un fichier storage à partir de son `url` |

`targetId` est requis quand `type='bonus'` ; ignoré (forcé à NULL) quand
`type='none'`.

## Upload — UN SEUL appel, service existant

`POST /banner` (et `PATCH /banner/:id`) accepte du **`multipart/form-data`** avec
le champ **`image`** (multer). Le contrôleur appelle le service **existant**
`uploadImageToSupabase` (`src/services/images/uploadImage.service.js` — le MÊME
que `POST /image/upload`) puis insère le banner avec l'URL **Supabase** obtenue.
Aucun nouvel endpoint d'upload : on couple simplement le `POST /banner` au
service déjà là. Une `imageUrl` directe en JSON (déjà hébergée) reste possible ;
le fichier `image` prime s'il est fourni.

## Fichiers

- `schema/migrations/044_banners.sql`
- `repositories/mappers.js` (`banner` to/fromSupabase)
- `repositories/supabase/banners.repo.js`
- `services/banners/banners.service.js` (algos de re-index)
- `controllers/banners/banners.controller.js`
- `routes/bannersRoutes.js`
- `app.js` : `app.use('/banner', bannersRoutes)`
- `controllers/fastfood/getFastFoods.js` : injecte `banners` dans `/fastfood/all`
- `services/images/uploadImage.service.js` (`uploadImageToSupabase` / `deleteImageFromSupabase`) + route `/image` : upload & delete Supabase storage
