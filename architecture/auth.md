# Auth — Backend

## Vue d'ensemble

Auth basée sur Firebase Auth : le client s'authentifie côté Firebase SDK (email/password ou Google), récupère un **idToken**, puis l'envoie au backend via l'en-tête `Authorization: Bearer <idToken>`.

## Middleware

**`BACKEND/src/middlewares/authMiddleware.js`** :
- Extrait le Bearer token de `req.headers.authorization`.
- `admin.auth().verifyIdToken(token)` → attache `req.user = decodedToken`.
- 401 si absent/invalide.

## Routes principales liées à l'utilisateur

| Méthode | Path | Controller | Description |
|---|---|---|---|
| GET | `/user/:uid` | `userController.getUser` | Profil user + `fcmTokens[]` |
| POST | `/user` | `userController.createUser` | Crée user Firestore après inscription |
| PUT | `/user/:uid` | `userController.updateUser` | MAJ profil (dont `fcmToken` → arrayUnion) |
| DELETE | `/user/fcmToken` | `userController.removeFcmToken` | Retire un token (logout device) |

## fcmTokens — multi-device

- Champ `users/{uid}.fcmTokens: string[]` (Expo tokens + FCM natifs mélangés).
- `arrayUnion` à l'ajout, `arrayRemove` au cleanup.
- Mis à jour :
  - À l'init de l'app : `PUT /user/:uid` avec `{ fcmToken }`.
  - Au logout : `DELETE /user/fcmToken`.
  - En cleanup automatique via `cleanStaleTokens` (voir [notifications.md](./notifications.md)).

## Flow côté frontend

Voir `yaammoo/architecture/auth.md` pour le détail des flows Email/Password et Google Sign-In côté client.
