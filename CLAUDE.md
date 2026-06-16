# Consignes projet — BACKEND yaammoo (Node.js / Express)

Ce fichier est **versionné** : ses règles s'appliquent automatiquement sur tout
PC où le projet est cloné/pull, dans n'importe quelle session Claude Code.

## À lire en DÉBUT de session (OBLIGATOIRE)

Lis **`architecture/README.md`** avant de travailler : il donne une vue 360 du backend
(structure services, routes, controllers, repositories, mappers Firestore/Supabase).

**⚠️ INTERDIT : lancer un agent Explore pour "découvrir" le backend.** Les fichiers `.md` par feature
ont été rédigés précisément pour éviter cette perte de temps. Lis avec `Read` direct (1 seul appel).
Ne lance un agent Explore que si tu cherches quelque chose d'ultra-précis introuvable dans
`architecture/` (ex. une fonction exacte). Pas pour "comprendre le backend".

**Frontend yaammoo** : avant de travailler sur intégration frontend-backend, lire `../../yaammoo/CLAUDE.md`.

**Tenir à jour** : dès qu'un travail modifie structure services/routes/features, mets à jour
`architecture/README.md` et le fichier `.md` concerné avant de clore.

---

## Architecture & Modularité (OBLIGATOIRE)

L'architecture doit rester **propre, moderne, modulaire**. Règles non négociables :

### Taille de fichier

- **Viser ~400 lignes, 500 = plafond DUR**
- Au-delà de 500, découper obligatoirement (un service par domaine métier, pas de fourre-tout)

### Responsabilités claires

- **Controllers** : validation HTTP + transformation requête → service
- **Services** : orchestration logique métier + appels repos (jamais DB direct)
- **Repositories** : accès DB abstrait, implémentations Firestore/Supabase interchangeables
- **Mappers** : conversions Firestore ↔ Supabase (dans `repositories/mappers.js`)

### Features isolées

Chaque domaine (users, merchants, orders, payments, notifications) :

- Controllers séparés
- Services séparés
- Routes séparées
- Doc architecture dédiée (`architecture/<feature>.md`)

---

## Database Pattern (OBLIGATOIRE)

**Repository Pattern** : Services ne connaissent PAS la DB utilisée.

```javascript
// ✅ BON : Service appelle une interface stable
const user = await repos.users.getUserById(id);

// ❌ MAUVAIS : Service appelle DB directe
const user = await db.collection('users').doc(id).get();
```

**DB = Supabase uniquement** (la migration Firestore → Supabase est TERMINÉE pour la
couche données pures) :

- `DB_PROVIDER=supabase` (seule valeur supportée ; toute autre est ignorée avec un warn)
- `repositories/index.js` délègue directement à `repositories/supabase/*`
- La couche `repositories/firestore/` a été **supprimée**

> ⚠️ **Firebase reste utilisé hors BD pure** : Auth (`admin.auth()`), Push notifications
> (`admin.messaging()`), Storage (`admin.storage()` / bucket). Voir `config/firebase.js` —
> ne PAS le supprimer. `admin.firestore()` n'est plus exposé.

**Mappers** (`repositories/mappers.js`) :

- `user.toSupabase()` / `user.fromSupabase()` : conversions camelCase ↔ snake_case
- **Logique métier calculée ici** : ex. `isMarchand: !!fastfood_id` (jamais stocké)

---

## isMarchand Logic (IMPORTANT)

**Rule** : `isMarchand` n'est JAMAIS un champ figé. Il est **calculé** à chaque lecture basé sur `fastFoodId`.

```javascript
// ❌ MAUVAIS : retourner le champ stocké
isMarchand: row.is_marchand;

// ✅ BON : calculer basé sur fastFoodId
isMarchand: !!row.fastfood_id;
```

**Où appliquer** :

- `repositories/supabase/users.repo.js` (lectures user)
- `repositories/mappers.js` (`userFromSupabase`)

**Résultat** :

- Ancien compte avec fastFoodId mais `isMarchand: false` stocké → reconnu comme marchand ✅
- Nouveau compte sans fastFoodId → `isMarchand: false` ✅
- Boutique créée → `fastFoodId` assigné → `isMarchand: true` instantanément ✅

---

## API REST & Swagger

- Endpoint base : `${Config.apiUrl}` (env var)
- Doc Swagger : `/api-docs`
- **Mettre à jour Swagger** après tout nouvel endpoint ou changement signature
- Bearer token : header `Authorization: Bearer <idToken>`

---

## Authentication & Authorization

**Middleware** : `firebaseAuth` (src/middlewares/authMiddleware.js)

- Valide Bearer token Firebase → extrait `req.user.uid`
- Routes protected : ajouter `firebaseAuth` en paramètre du router

**Example** :

```javascript
router.post('/user', firebaseAuth, createUser); // Protected
router.get('/user/:id', getOneUserByIdController); // Public (TODO: protect?)
```

---

## Socket.io & Realtime

**Rooms** :

- `app:<appId>` : broadcast à toute l'app (système)
- **`<userId>`** (room nommée par l'uid, SANS préfixe) : notifications/commandes pour UN
  utilisateur. ⚠️ Le frontend rejoint via `join_user` → `socket.join(userId)` (cf. `socket.js`),
  donc TOUJOURS émettre avec `io.to(userId)` — pas `io.to(\`user:${userId}\`)`.
- `<fastFoodId>` (room nommée par l'id boutique) : commandes reçues par UN marchand

**Événements clés** :

- `payment.settled` : verdict paiement (broadcast user room)
- `order.status_changed` : statut commande (broadcast concernés)
- `newFastfoodOrders` : nouvelle(s) commande(s) (broadcast fastfood room)
- `newPeriodKeyDelivering` : livraison lancée (broadcast user room)

Voir `architecture/socket-events.md` pour la liste complète.

---

## Validation & Erreurs

**Validation** : `src/utils/validator/` — chaque domaine a son validateur

- Lancer les validates AVANT logique métier
- Retourner 400 + message clair si validation échoue

**Erreurs**:

```javascript
try {
  // logique
} catch (error) {
  res.status(500).json({ error: error.message });
}
```

**Pas d'erreurs silencieuses** : Toujours logger + répondre au client.

---

## Variables d'environnement

**Règle d'or:**

- Besoin d'une valeur? Soit elle est dans `.env`, soit tu l'ajoutes dans `.env`
- **JAMAIS** de valeurs en dur dans le code (URLs, clés, secrets, etc.)
- Toujours utiliser `process.env.VAR_NAME`

**Exemple:**

```javascript
// ✅ BON
const url = process.env.BACKEND_URL;

// ❌ MAUVAIS
const url = 'http://localhost:5000'; // hardcodé!
const url = process.env.BACKEND_URL || 'http://localhost:5000';
```

Voir `.env` pour la liste complète des variables.

---

## Conventions de branches

Toujours préfixer selon la nature :

- `debug/<sujet>` — investigation/résolution d'un bug précis
- `feature/<sujet>` — nouvelle fonctionnalité ou durcissement
- `backup/<sujet>` — sauvegarde d'un état (ne pas y travailler)

**Règle** : tout work de debug commence sur une branche `debug/`, créée depuis la branche d'où vient le bug.

---

## Documentation

Après toute modif des services/routes/features, **mettre à jour** :

- `architecture/README.md` : index + patterns clés
- `architecture/<feature>.md` : routes, structures, flux, services

---

## Tests & Validation

- **API** : Swagger endpoint manual + Postman/curl
- **DB** : Vérifier lecture/écriture en Firestore ET Supabase (si migration en cours)
- **Socket** : Émettre + listen sur rooms appropriées
- **Webhooks** : Tester MobileWallet avec sandbox keys

---

---

## Deploy

- Docker : `Dockerfile`
- Platform : Fly.io (`fly.toml`)
- Script deploy : `scripts/deploy.sh` (TODO : créer si absent)
- Logs : vérifier Fly.io dashboard après push

---

## Performance & Monitoring

- Queries N+1 : éviter (batch Firestore.in() ou Supabase joins)
- Timeouts : MobileWallet API peut être lente (retry logic)
- Logs : structure JSON pour parsing (ex. Datadog, Sentry)

---

## Code Style

- ESLint config : `.eslintrc`
- Prettier config : `.prettierrc.js`
- Format before commit : `npm run format`
- Lint check : `npm run lint`

Run both before pushing!
