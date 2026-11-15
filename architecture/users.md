# Feature — Users (Authentification & Profil)

## Rôle

Gestion des utilisateurs : enregistrement, authentification, récupération de profil, suppression de compte. Calcul automatique du champ `isMarchand` basé sur l'existence de `fastFoodId`.

---

## Routes

| Méthode | Endpoint                  | Contrôleur                 | Rôle                                    |
| ------- | ------------------------- | -------------------------- | --------------------------------------- |
| POST    | `/user`                   | `createUser`               | Crée un nouvel utilisateur (protected)  |
| GET     | `/user/:id`               | `getOneUserByIdController` | Récupère un user par UID                |
| GET     | `/user/email/:email`      | `getUserByEmail`           | Récupère user par email                 |
| GET     | `/user/phone/:phone`      | `getUserByPhone`           | Récupère user par téléphone             |
| PUT     | `/user/:id`               | `updateUser`               | Met à jour le profil user               |
| DELETE  | `/user/delete-account`    | `deleteOwnAccount`         | Supprime le compte (RGPD)               |
| POST    | `/user/push-token/add`    | `addPushToken`             | Enregistre un token push (multi-device) ; retire ce device / token des AUTRES comptes (changement de compte sans logout réussi) |
| POST    | `/user/push-token/remove` | `removePushToken`          | Désenregistre un token push             |
| POST    | `/user/location`          | `recordUserLocationController` | Position du user connecté (historique + dernière position) — voir [user-location.md](./user-location.md) |

---

## Structure de données

```typescript
User {
  id: string                // UUID Firestore/Supabase
  uid: string              // Firebase Auth UID
  infos: {
    nom: string
    prenom: string
    age: number
    numero: number          // Téléphone
    email: string
    password: string        // Hash ou stocké en clair (TODO : audit)
  }
  fastFoodId: string        // Référence à doc fastfoods (null si client pur)
  isMarchand: boolean       // Computed: !!fastFoodId (calculé à chaque read)
  statistique: number       // Score utilisateur
  cmd: string[]            // Array IDs commandes
  pushTokens: PushToken[]  // Multi-device tokens
  // Aucune colonne de localisation : tout est dans la table user_locations
  // (migration 054), voir user-location.md.
  createdAt: ISO8601
  updatedAt: ISO8601
}

PushToken {
  token: string            // Token FCM ou Expo
  platform: 'ios' | 'android'
  deviceId: string         // Identifiant device unique
  lastSeen: ISO8601
}
```

---

## Flux clé

### Enregistrement (sign-up)

1. Frontend : `createUserWithEmailAndPassword()` (Firebase Auth)
2. Frontend : appelle POST `/user` avec :
   ```json
   {
     "uid": "...",
     "infos": { "nom", "prenom", "age", "numero", "email", "password" },
     "isMarchand": false,      // Toujours false au sign-up
     "statistique": 100,
     "fastFoodId": ""
   }
   ```
3. Backend : `createUser()` service → `repos.users.createUser()`
4. Firestore/Supabase : stocke le document
5. Frontend : reçoit l'UID, stocke dans AuthContext

### Récupération du profil

1. Frontend : appelle GET `/user/:uid`
2. Backend : `getOneUserByIdController()` → `userService.getUserById()`
3. Mapper Supabase (`mappers.js`) :
   ```javascript
   isMarchand: !!row.fastfood_id;
   ```
4. Frontend : reçoit user avec `isMarchand` recalculé automatiquement ✅

### Suppression de compte (RGPD)

1. Frontend : DELETE `/user/delete-account` (authenticated)
2. Backend (`userService.deleteUserAccount`) :
   - Durée de conservation : **10 ans** si les paiements réels du compte
     (`order_settlements`, en client ou en boutique) s'étalent sur au moins
     365 jours, sinon **90 jours**.
   - `users.deleteCascade` : boutique en suppression douce (`deleted_at`,
     `deleted_reason = 'account'`, migration 080), ligne users supprimée (push
     tokens, positions, analytics, support en cascade). Rien d'autre n'est effacé.
   - Profil brut archivé dans `account_archives` (`retain_until`), avec les
     identités de connexion lues dans Firebase Auth AVANT sa suppression
     (`identity_keys`, migration 082 : `email:…`, `phone:…`, `google.com:<sub>`,
     `apple.com:<sub>`, `utils/authIdentityKeys.js`).
   - Compte Firebase Auth supprimé.
3. `accountPurgeJob` (1×/jour) à `retain_until` :
   - compte peu actif (90 jours) : `purgePersonal` efface les données
     personnelles (profil archivé, identités, notifications, menus, numéros
     vérifiés…) ; commandes, transactions, règlements, retraits restent, et
     `retain_until` passe à 10 ans après la suppression (`personal_purged`,
     migration 082). La boutique n'est plus restaurable ;
   - à 10 ans : `purge` efface tout (argent, boutiques, archive). La purge des boutiques
   supprimées par un admin (047) ignore `deleted_reason = 'account'` (migration 081).
4. Restauration : `GET /shop-restore` liste les boutiques supprimées avec le
   compte de la même personne : le compte recréé a un nouvel uid, le
   rapprochement se fait par identités de connexion (une seule en commun suffit,
   quel que soit le mode de connexion). `POST /shop-restore/:id` restaure,
   rattache la boutique au nouveau compte (`fastfoods.user_id`) et la retire de
   l'archive (`fastfood_ids`), donc la purge du compte supprimé ne la touche
   plus (409 si une boutique est déjà active).

---

## Logique `isMarchand`

**Problem** : Ancien code stockait `isMarchand` comme booléen figé. Si un compte était créé avant que `fastFoodId` soit assigné, `isMarchand` restait `false` même après création de boutique.

**Solution** : **Calculer `isMarchand` à chaque read** (dans repos, pas stocké).

```javascript
// Firestore users.repo.js (ligne 30)
return { ...rawData, isMarchand: !!rawData.fastFoodId };

// Supabase users.repo.js via mapper (ligne 72)
isMarchand: !!row.fastfood_id;
```

**Résultat** :

- ✅ Nouveau compte créé → `isMarchand: false` (pas de boutique)
- ✅ Boutique créée → `isMarchand: true` (fastFoodId assigné)
- ✅ Ancien compte avec `fastFoodId` → `isMarchand: true` (recalculé au read)
- ✅ Fonctionne pour Firestore ET Supabase

---

## Services & Repositories

**userService.js** : Façade stable vers repos (idempotent pour migration Firestore ↔ Supabase)

- `getAllUsers()`
- `getUserById(id)`
- `createUser(data)`
- `updateUser(id, data)`
- `saveUser(id, data)` — merge sur repos
- `addPushToken(userId, payload)`
- `removePushToken(userId, payload)`
- `deleteUserAccount(uid)` — suppression complète RGPD

**repos.users** : Interface stable implémentée par :

- `supabase/users.repo.js` — Supabase via `supabase-js` (seule impl. active)

---

## Validations

- Email : format valide, non-vide
- Téléphone : 9+ chiffres
- Age : 0+
- Password : non-vide (TODO : hash bcrypt)

## Erreurs courantes

- 404 : User non trouvé
- 400 : Données invalides ou utilisateur déjà existe
- 401 : Token Firebase expiré/invalide (middleware authMiddleware)
