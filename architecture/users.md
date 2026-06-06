# Feature — Users (Authentification & Profil)

## Rôle

Gestion des utilisateurs : enregistrement, authentification, récupération de profil, suppression de compte. Calcul automatique du champ `isMarchand` basé sur l'existence de `fastFoodId`.

---

## Routes

| Méthode | Endpoint | Contrôleur | Rôle |
|---------|----------|-----------|------|
| POST | `/user` | `createUser` | Crée un nouvel utilisateur (protected) |
| GET | `/user/:id` | `getOneUserByIdController` | Récupère un user par UID |
| GET | `/user/email/:email` | `getUserByEmail` | Récupère user par email |
| GET | `/user/phone/:phone` | `getUserByPhone` | Récupère user par téléphone |
| PUT | `/user/:id` | `updateUser` | Met à jour le profil user |
| DELETE | `/user/delete-account` | `deleteOwnAccount` | Supprime le compte (RGPD) |
| POST | `/user/push-token/add` | `addPushToken` | Enregistre un token push (multi-device) |
| POST | `/user/push-token/remove` | `removePushToken` | Désenregistre un token push |

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
3. Repository (Firestore) :
   ```javascript
   return { ...rawData, isMarchand: !!rawData.fastFoodId }
   ```
   **Mapper (Supabase)** : fait de même avec `row.fastfood_id`
4. Frontend : reçoit user avec `isMarchand` recalculé automatiquement ✅

### Suppression de compte (RGPD)

1. Frontend : DELETE `/user/delete-account` (authenticated)
2. Backend :
   - Supprime : collections orders, transactions, notifications, menus, fastfoods (via userId/fastFoodId)
   - Supprime : document users
   - Supprime : Firebase Auth account
3. Return : `{ uid, deletedAt }`

---

## Logique `isMarchand`

**Problem** : Ancien code stockait `isMarchand` comme booléen figé. Si un compte était créé avant que `fastFoodId` soit assigné, `isMarchand` restait `false` même après création de boutique.

**Solution** : **Calculer `isMarchand` à chaque read** (dans repos, pas stocké).

```javascript
// Firestore users.repo.js (ligne 30)
return { ...rawData, isMarchand: !!rawData.fastFoodId }

// Supabase users.repo.js via mapper (ligne 72)
isMarchand: !!row.fastfood_id
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

**repos.users** : Interface stable implemented par :
- `firestore/users.repo.js` — Firestore via `firebase-admin`
- `supabase/users.repo.js` — Supabase via `supabase-js`

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
