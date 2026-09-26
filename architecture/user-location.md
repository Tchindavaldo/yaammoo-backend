# Localisation des utilisateurs

L'app demande la permission de localisation **après** celle des notifications,
puis envoie la position à chaque connexion, au retour au premier plan et, si
l'utilisateur a accordé « Toujours », **app fermée** (tâche arrière-plan). Le
lieu (ville, département, région…) vient du **géocodage inverse du téléphone**
(`expo-location`), pas d'un service serveur (aucune clé d'API). Migration :
`054_user_locations.sql`.

## Route

`POST /user/location` — `firebaseAuth`. L'utilisateur est celui du Bearer.

Payload (`interface/userLocationFields.js`, `validateUserLocation`) :

| Champ | Règle |
|---|---|
| `latitude`, `longitude` | requis, bornés |
| `accuracy` | ≥ 0 (m) |
| `altitude` | [−1000, 10000] (m) |
| `speed` | ≥ 0 (m/s) |
| `heading` | [0, 360] (degrés) |
| `city`, `subregion` (département), `region`, `district` (quartier), `street`, `placeName`, `postalCode`, `country` | ≤ 120 |
| `streetNumber` | ≤ 20 |
| `formattedAddress` | ≤ 300 (Android) |
| `isoCountryCode` | ≤ 3 |
| `timezone` | ≤ 64 (iOS) |
| `source` | requis : `login` · `app_open` · `foreground` · `background` |
| `platform` | `ios` · `android` · `web` |
| `capturedAt` | ISO 8601 ; hors [maintenant − 7 j, maintenant + 5 min] → heure serveur |

Réponses : 201 `{ data: { city } }`, 400, 401, 404 (user absent).

## Stockage

**Tout est dans `user_locations`** : une ligne par capture, jamais écrasée ni
dédoublonnée. La table `users` ne porte **aucune** colonne de localisation ; la
dernière position d'un user est sa ligne la plus récente (`captured_at`).

Un géocodage inverse raté donne une ligne sans lieu (coordonnées seules) : la
« dernière ville connue » est celle de la capture la plus récente **ayant** une
ville (index partiel `idx_user_locations_user_city`).

Données personnelles : supprimées avec le compte (`ON DELETE CASCADE`).

> La première version de 054 recopiait la dernière position sur
> `users.location_*`. La migration actuelle retire ces colonnes si elles
> existent (`DROP COLUMN IF EXISTS`) : sûre sur les deux états de base.

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
