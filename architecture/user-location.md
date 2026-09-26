# Localisation des utilisateurs

L'app demande la permission de localisation **après** celle des notifications,
puis envoie la position à chaque connexion. La ville, le département et la
région viennent du **géocodage inverse du téléphone** (`expo-location`), pas
d'un service serveur (aucune clé d'API). Migration : `054_user_locations.sql`.

## Route

`POST /user/location` — `firebaseAuth`. L'utilisateur est celui du Bearer.

Payload (`interface/userLocationFields.js`, `validateUserLocation`) :

| Champ | Règle |
|---|---|
| `latitude`, `longitude` | requis, bornés |
| `accuracy` | ≥ 0 (m) |
| `city`, `subregion` (département), `region`, `district` (quartier), `street`, `postalCode`, `country` | ≤ 120 |
| `isoCountryCode` | ≤ 3 |
| `source` | requis : `login` · `app_open` · `foreground` · `background` |
| `platform` | `ios` · `android` · `web` |
| `capturedAt` | ISO 8601 ; hors [maintenant − 7 j, maintenant + 5 min] → heure serveur |

Réponses : 201 `{ data: { city } }`, 400, 401, 404 (user absent).

## Stockage

| Où | Contenu |
|---|---|
| `user_locations` | **historique** : une ligne par capture, jamais dédoublonnée |
| `users.location_*` | **dernière** position : `lat`, `lng`, `city`, `subregion`, `region`, `district`, `country`, `updated_at` |

Un géocodage inverse raté (champs de lieu vides) met à jour les coordonnées mais
**garde** la dernière ville connue.

Données personnelles : supprimées avec le compte (`ON DELETE CASCADE`).

## Usages

- Audience « ville » des notifications boutique : `city_user_ids(ville)`
  (voir [notifications-broadcast.md](./notifications-broadcast.md)).
- Marketing / analyse : historique `user_locations` (index `user_id,
  captured_at` et `lower(city)`).

## Fichiers

```
schema/migrations/054_user_locations.sql
src/interface/userLocationFields.js
src/utils/validator/validateUserLocation.js
src/repositories/supabase/userLocations.repo.js
src/services/user/userLocation.service.js
src/controllers/user/userLocation.controller.js
src/routes/userRoutes.js                # POST /user/location
```
