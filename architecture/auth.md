# Auth — Backend

## Vue d'ensemble

Auth basée sur Firebase Auth : le client s'authentifie côté Firebase SDK (email/password ou Google), récupère un **idToken**, puis l'envoie au backend via l'en-tête `Authorization: Bearer <idToken>`.

## Middleware

**`BACKEND/src/middlewares/authMiddleware.js`** :

- Extrait le Bearer token de `req.headers.authorization`.
- `admin.auth().verifyIdToken(token)` → attache `req.user = decodedToken`.
- 401 si absent/invalide.

## Carte des accès (toutes les routes)

**Règle** : toute route exige le jeton, ET l'identité est vérifiée — un
`userId` du corps / de l'URL doit être l'appelant (`authorize(selfFromBody|
selfFromParam)`), une ressource de boutique exige un accès à cette boutique
(`fastfoodFromParam`, `requireFastfoodPermission`). L'admin plateforme passe
partout. Les résolveurs vivent dans `middlewares/staffPermissionMiddleware.js`.

**Seules exceptions, sans jeton** :

| Route | Pourquoi |
| --- | --- |
| `GET /fastFood/all`, `GET /fastFood/search`, `GET /fastFood/:id` | Catalogue du visiteur non connecté (auth optionnelle) |
| `GET /menu/:fastFoodId`, `GET /menu/:menuId/ratings`, `GET /banner` | Catalogue public (page boutique, bannière du home) |
| `GET /settings/app-version`, `GET /settings/pricing` | Lus avant la connexion (mise à jour forcée, frais) |
| `POST /auth/signUp`, `POST /auth/phone/request`, `POST /auth/phone/verify` | Connexion elle-même |
| `POST /transaction/webhook/mobilewallet` | Appel serveur MobileWallet ⚠️ non signé |
| `GET /payment-page` | Page statique de la WebView (n'appelle aucune API) |

**Versions tolérées sans jeton** : une requête SANS jeton dont le header
`x-app-version` figure dans `test_no_auth_versions` (settings_test, migration
058, défaut `["1.1.0","1.1.1"]`) passe comme une ancienne app
(`req.legacyNoAuth`, `authorize` ne contrôle rien). ⚠️ Le header se falsifie :
garder ce tableau vide hors période de test. Les routes qui lisent l'uid du
jeton (portefeuille, bonus…) ou réservées admin / boutique restent fermées.

Réservées à l'admin : `GET /user`, `/user/email/:email`, `/user/phone/:phone`,
`PUT /transaction/:id`, `POST /sms/whatsapp`, coûts / détails OTP.
`isAdmin` est retiré du corps de `POST /user` et `PUT /user/:id` sauf pour un admin.

## Routes principales liées à l'utilisateur

| Méthode | Path             | Controller                      | Description                               |
| ------- | ---------------- | ------------------------------- | ----------------------------------------- |
| GET     | `/user/:uid`     | `userController.getUser`        | Profil user + `fcmTokens[]`               |
| POST    | `/user`          | `userController.createUser`     | Crée user Firestore après inscription     |
| PUT     | `/user/:uid`     | `userController.updateUser`     | MAJ profil (dont `fcmToken` → arrayUnion) |
| DELETE  | `/user/fcmToken` | `userController.removeFcmToken` | Retire un token (logout device)           |

## fcmTokens — multi-device

- Champ `users/{uid}.fcmTokens: string[]` (Expo tokens + FCM natifs mélangés).
- `arrayUnion` à l'ajout, `arrayRemove` au cleanup.
- Mis à jour :
  - À l'init de l'app : `PUT /user/:uid` avec `{ fcmToken }`.
  - Au logout : `DELETE /user/fcmToken`.
  - En cleanup automatique via `cleanStaleTokens` (voir [notifications.md](./notifications.md)).

## Flow côté frontend

Voir `yaammoo/architecture/auth.md` pour le détail des flows Email/Password et Google Sign-In côté client.
