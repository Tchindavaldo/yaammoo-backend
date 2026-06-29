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

## Versioning par version d'app (OBLIGATOIRE — compatibilité ascendante)

> ⚠️ Règle **non négociable**. Le but : ne JAMAIS casser une version d'app déjà
> publiée sur les stores quand on change la forme des données renvoyées au frontend.
> Les utilisateurs ne mettent pas tous à jour en même temps : pendant la transition,
> l'ancienne et la nouvelle version de l'app appellent le **même** backend.

### Quand cette règle s'applique (déclencheur)

**Dès qu'un travail — nouvel endpoint OU modification d'un endpoint existant —
change la FORME des données reçues côté frontend**, c.-à-d. tout ce qui peut faire
planter ou mal afficher une version d'app déjà en prod :

- changement de **type** d'un champ (ex. `["10:00"]` → `[{hour:"10:00", ...}]`)
- **renommage / suppression** d'un champ lu par le frontend
- changement de **structure** d'un objet ou d'un tableau renvoyé
- nouveau champ **remplaçant** un ancien

Si le changement est purement additif ET ignoré par les anciennes apps (nouveau
champ jamais lu par l'existant), la règle ne s'impose pas — mais en cas de doute,
on l'applique.

### Ce qu'il FAUT faire (sans exception)

1. **Détecter la version du client** via l'utilitaire GÉNÉRIQUE centralisé
   `src/utils/appVersion.js` (`resolveClientVersion(req)` /
   `clientVersionAtLeast(req, minVersion)`). Ne JAMAIS réimplémenter la détection
   ailleurs, et ne JAMAIS mettre cette logique transverse dans un fichier spécifique
   à un domaine (ex. `deliveryHoursFormat.js` ne gère QUE les heures de livraison).
   - Priorité 1 : header `x-app-version` (version réelle du client).
   - Priorité 2 (fallback si pas de header) : env **`FRONTEND_APP_VERSION`**.
   - Chaque domaine définit son propre seuil (env dédiée) et une fonction métier
     fine (ex. `clientSupportsNewDeliveryFormat`) qui s'appuie sur `appVersion.js`.
2. **Adapter la réponse dans le controller** (qui a accès à `req`), jamais dans le
   repository/mapper : on garde un seul format en base, on transforme à la sortie.
3. **Servir l'ancien format aux anciennes apps** et le nouveau aux versions >= seuil.
   Le seuil est porté par une env dédiée (ex. `APP_DELIVERY_NEW_MIN_VERSION`).
4. **Documenter** dans `architecture/<feature>.md` les deux formats + le seuil de
   version + l'env de bascule.
5. **Au déploiement de la nouvelle version d'app**, basculer `FRONTEND_APP_VERSION`
   (et tout seuil concerné) côté Fly : `flyctl secrets set FRONTEND_APP_VERSION=x.y.z`.

### Ce qu'il NE faut JAMAIS faire

- ❌ Changer la forme des données renvoyées sans gérer l'ancienne version d'app.
- ❌ Mettre la logique de version dans le repository ou le mapper.
- ❌ Hardcoder une version ou un seuil dans le code (toujours via `.env`).
- ❌ Dupliquer la détection de version : réutiliser l'utilitaire central.

> 💡 `FRONTEND_APP_VERSION` est **générique et réutilisable** : tout nouvel endpoint
> soumis à cette règle s'appuie sur la même variable et le même utilitaire.

### ⚠️ Déploiement Fly — piège connu

`flyctl secrets set ...` **ne rebuild PAS le code** : il redémarre la machine avec
l'**image existante**. Pour déployer du **code** modifié, toujours lancer
`flyctl deploy`. Set des secrets seuls ≠ déploiement du nouveau code.

---

## Conventions de branches Git

> ⚠️ Cette section parle **exclusivement de branches Git** (`git checkout -b ...`).
> Elle n'a rien à voir avec l'organisation des dossiers/modules dans le code.
> Quand on dit "isoler un travail", on parle de **l'isoler sur sa propre branche Git**.

**Règle d'or : tout travail de changement — moyen ou important — doit se faire sur
une NOUVELLE branche Git créée AVANT de toucher au code.** Ne jamais coder
directement sur `main`. Avant la moindre modification non triviale, créer la branche
avec le bon préfixe, puis travailler dessus.

Sont concernés (liste non exhaustive) : nouvelle fonctionnalité, refacto, ajout
de route/contrôleur/service, modification d'un flux, correction de bug. Seules les
retouches ultra-mineures (typo, commentaire, log) peuvent rester sur la branche courante.

Toujours préfixer selon la nature :

- `debug/<sujet>` — investigation/résolution d'un bug précis
- `feature/<sujet>` — nouvelle fonctionnalité ou durcissement
- `backup/<sujet>` — sauvegarde d'un état (ne pas y travailler)

Règles de création :
- **Tout travail de debug** commence sur une branche `debug/`, créée depuis la
  branche d'où vient le bug (pas depuis `main`).
- **Tout travail de feature / changement moyen ou important** commence sur une
  branche `feature/`, créée depuis `main` (sauf indication contraire).
- Une branche = un sujet. Ne pas mélanger plusieurs travaux sur la même branche.

---

## Documentation

Après toute modif des services/routes/features, **mettre à jour** :

- `architecture/README.md` : index + patterns clés
- `architecture/<feature>.md` : routes, structures, flux, services

---

## Schema & Migrations (OBLIGATOIRE)

**Ne jamais modifier `schema/migrations/schema.sql` directement** pour un changement incrémental.

### Règles

- Tout changement de schéma DB (ALTER TABLE, nouvelle colonne, index, fonction SQL) = **nouveau fichier de migration numéroté**
- Répertoire : `schema/migrations/`
- Nommage : `NNN_description_courte.sql` (ex. `007_orders_user_data.sql`)
- Chaque migration doit être **idempotente** : utiliser `IF NOT EXISTS` / `IF EXISTS` partout
- Appliquer manuellement dans l'éditeur SQL du dashboard Supabase

### Quand mettre à jour `schema.sql`

`schema.sql` = état cible complet de la DB (snapshot). Le mettre à jour **après** avoir appliqué la migration en prod, pour qu'il reste la référence à jour.

### Exemple

```sql
-- 007_orders_user_data.sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_data            JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_price_index INTEGER;
```

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
