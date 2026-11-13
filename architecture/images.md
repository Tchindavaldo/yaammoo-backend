# Images — upload, corbeille, effacement différé

Bucket Supabase Storage du projet courant (`SUPABASE_URL`). Upload :
`POST /image/upload` (`services/images/uploadImage.service.js`,
`services/storage/uploadFile.service.js`).

## Corbeille (migration 071)

Une image **remplacée ou supprimée** n'est plus effacée tout de suite :
`purgeUnusedImages(oldUrls, keptUrls, { entity, entityId, field })` l'inscrit
dans `image_trash`.

| Endroit | Remplacement | Suppression |
|---|---|---|
| Menu (`image`, `coverImage`, `images`) | `updateMenu.service` | `deleteMenu.service` |
| Logo boutique (`image`) | `updateFastFood` | soft delete boutique (purge 90 j, effacement direct) |
| Bannière (`imageUrl`) | `banners.service` | `banners.service` |
| Flyer bonus (`flyerUrl`) | `patchBonus.service` | — |
| `DELETE /image` | — | corbeille (sans origine) |

- **Effacement** : après `image_trash_retention_days` jours
  (`settings_deployment`, **60** par défaut, modifiable à chaud), par
  `purgeImageTrash` dans le job `utils/fastfoodPurgeJob.js` (même cadence
  `fastfood_purge_interval_ms`).
- Seules les URL du storage du projet courant sont concernées : une image
  hébergée ailleurs (ex. ancien projet) n'est jamais effacée.

## Admin

| Verbe | Path | Effet |
|---|---|---|
| GET | `/image/admin/trash` | `{ retentionDays, items: [{ id, url, entity, entityId, field, trashedAt, purgeAt }] }` |
| POST | `/image/admin/trash/:id/restore` | remet l'image dans son champ (galerie : ajoutée à la fin) ; l'image remplacée part en corbeille. Ligne disparue : fichier seulement conservé (`reattached: false`). 404 / 409 |

Garde : `firebaseAuth` + `adminGuard`.

## Fichiers

```
schema/migrations/071_image_trash.sql
src/repositories/supabase/imageTrash.repo.js
src/services/images/uploadImage.service.js     # purgeUnusedImages -> corbeille
src/services/images/imageTrash.service.js      # liste, restauration, effacement
src/controllers/images/imageTrash.controller.js
src/routes/imageRoutes.js
src/utils/fastfoodPurgeJob.js                  # appelle purgeImageTrash
```
