# Consignes projet — BACKEND yaammoo (Node.js / Express)

Ce fichier est **versionné** : ses règles s'appliquent automatiquement sur tout
PC où le projet est cloné/pull, dans n'importe quelle session Claude Code.

> **20 règles numérotées R1 → R20.** Toute nouvelle règle ajoutée à ce fichier
> DOIT recevoir le numéro suivant (R20, R21, …) et le total ci-dessus doit être
> mis à jour. On cite une règle par son numéro (ex. « R1 » pour le style de réponse).

## R1 — Style de réponse (OBLIGATOIRE)

**Toujours COURT et DROIT AU BUT.** Pas de longues explications, pas de tableaux
à rallonge, pas de récapitulatifs verbeux. Répondre en quelques lignes. Le user
veut l'essentiel, pas un cours. Développer uniquement s'il le demande explicitement.

### Règles strictes (violations déjà constatées)

- **Répondre à CE qui est demandé, rien de plus.** « donne les noms et data du
  socket » = les noms et les data. Pas le contexte, pas les pièges, pas les
  conséquences front, pas les « deux points restants ».
- **JAMAIS créer un fichier `.md` récapitulatif** sans demande explicite. Un doc
  de 159 lignes pour une question de 2 lignes = hors sujet.
- **Pas de post-scriptum** : pas de « note : », « deux points à surveiller »,
  « veux-tu que je… ». Si le user veut la suite, il la demandera.
- **Ne pas re-répéter** ce qui a déjà été dit dans la session.
- Un tableau ou 3 lignes suffisent presque toujours. Si la réponse dépasse
  ~10 lignes sans qu'on l'ait demandé, c'est trop long.

### Ne PAS tester sans demande (OBLIGATOIRE)

- **Interdit** de lancer des tests (curl, scripts, listeners socket, node -e…)
  pour « vérifier » son propre travail. Ça gaspille des tokens.
- Faire le travail, puis **donner le résultat. Point final.**
- Le user teste lui-même. On ne teste QUE s'il le demande explicitement.
- **Ne jamais décider seul** d'un choix d'implémentation non demandé (ex. fusionner
  deux events en un seul). En cas d'ambiguïté : demander, ou suivre littéralement
  ce qui est écrit.

## R2 — À lire en DÉBUT de session (OBLIGATOIRE)

> **AU TOUT PREMIER MESSAGE de chaque conversation**, le hook
> `.claude/hooks/session-start-read.sh` (déclaré dans `.claude/settings.json`)
> injecte automatiquement **ce fichier** et `architecture/README.md` en entier.
> La lecture est donc garantie côté harness — rien à invoquer.
>
> **Accusé obligatoire** : la toute première réponse de la session doit commencer
> par la ligne fournie par le hook, seule sur sa ligne :
> `✅ CLAUDE.md lu en entier (N l., 18 règles R1→R18) + architecture/README.md (M l.)`
> Absence de cette ligne = hook non déclenché : le signaler et le réparer.

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

## R3 — Architecture & Modularité (OBLIGATOIRE)

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

### Champs & validation (OBLIGATOIRE)

**Tout endpoint qui reçoit un payload DOIT avoir :**

1. **Un fichier de field** (`src/interface/<domaine>Fields.js`) déclarant CHAQUE champ
   reçu, y compris les sous-champs de tableaux/objets (ex. `drink[].quantite`,
   `extra[].status`). Un champ envoyé par le front mais absent du field = **bug** :
   le validateur l'ignore ou le rejette silencieusement.
2. **Sa composition documentée** dans `architecture/<feature>.md` quand un champ est
   **calculé** (ex. `order.total` = `plat×quantity + Σ extras + Σ drinks×quantite`).
   Une formule métier ne doit jamais vivre uniquement dans la tête du dev.

> ⚠️ Divergence vécue : `drink[].quantite` était envoyé par le front, utilisé dans
> le calcul du `total`, mais **ni déclaré dans `orderFields.js` ni documenté**. Résultat :
> impossible de recalculer/vérifier le total côté serveur. Toujours refléter le payload
> réel dans le field ET la doc.

---

## R4 — Database Pattern (OBLIGATOIRE)

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

## R5 — isMarchand Logic (IMPORTANT)

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

## R6 — API REST & Swagger

- Endpoint base : `${Config.apiUrl}` (env var)
- Doc Swagger : `/api-docs`
- **Mettre à jour Swagger** après tout nouvel endpoint ou changement signature
- Bearer token : header `Authorization: Bearer <idToken>`

---

## R7 — Authentication & Authorization

**Middleware** : `firebaseAuth` (src/middlewares/authMiddleware.js)

- Valide Bearer token Firebase → extrait `req.user.uid`
- Routes protected : ajouter `firebaseAuth` en paramètre du router

**Example** :

```javascript
router.post('/user', firebaseAuth, createUser); // Protected
router.get('/user/:id', getOneUserByIdController); // Public (TODO: protect?)
```

---

## R8 — Socket.io & Realtime

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

## R9 — Validation & Erreurs

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

## R10 — Variables d'environnement

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

## R11 — Versioning par version d'app (OBLIGATOIRE — compatibilité ascendante)

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

> `FRONTEND_APP_VERSION` est **générique et réutilisable** : tout nouvel endpoint
> soumis à cette règle s'appuie sur la même variable et le même utilitaire.

### ⚠️ Déploiement Fly — piège connu

`flyctl secrets set ...` **ne rebuild PAS le code** : il redémarre la machine avec
l'**image existante**. Pour déployer du **code** modifié, toujours lancer
`flyctl deploy`. Set des secrets seuls ≠ déploiement du nouveau code.

---

## R12 — Conventions de branches Git

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

## R13 — Documentation

Après toute modif des services/routes/features, **mettre à jour** :

- `architecture/README.md` : index + patterns clés
- `architecture/<feature>.md` : routes, structures, flux, services

### Incohérences doc ↔ code : signaler ET corriger (OBLIGATOIRE)

Dès qu'une divergence est constatée entre le **code réel** et une doc
(`architecture/*.md`, annotations Swagger, `src/config/swagger.js`, commentaires),
il faut :

1. **Le dire explicitement** dans la réponse — ne jamais contourner en silence.
2. **Corriger la doc dans la foulée**, pour qu'elle reflète le code réel.

Le code fait foi. Une doc périmée est un piège : elle induit en erreur les
sessions suivantes et le frontend. Exemple vécu : le Swagger de `POST /order`
documentait `items[]` / `totalPrice` alors que la commande réelle porte
`menu` / `quantity` / `extra` / `drink` / `delivery` / `total`.

---

## R14 — Schema & Migrations (OBLIGATOIRE)

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

## R15 — Tests & Validation

- **API** : Swagger endpoint manual + Postman/curl
- **DB** : Vérifier lecture/écriture en Firestore ET Supabase (si migration en cours)
- **Socket** : Émettre + listen sur rooms appropriées
- **Webhooks** : Tester MobileWallet avec sandbox keys

---

---

## R16 — Deploy

- Docker : `Dockerfile`
- Platform : Fly.io (`fly.toml`)
- Script deploy : `scripts/deploy.sh` (TODO : créer si absent)
- Logs : vérifier Fly.io dashboard après push

---

## R17 — Performance & Monitoring

- Queries N+1 : éviter (batch Firestore.in() ou Supabase joins)
- Timeouts : MobileWallet API peut être lente (retry logic)
- Logs : structure JSON pour parsing (ex. Datadog, Sentry)

---

## R18 — Code Style

- ESLint config : `.eslintrc`
- Prettier config : `.prettierrc.js`
- Format before commit : `npm run format`
- Lint check : `npm run lint`

Run both before pushing!

## R19 — Emojis : statut SEULEMENT (OBLIGATOIRE)

**Aucun emoji décoratif**, nulle part : ni dans le code, ni dans les commentaires,
ni dans la doc, ni dans les logs, ni dans les messages de commit.

INTERDIT (décoratif) : `🎉` `🚀` `📡` `💡` `🔔` `🔍` `📦` `🗑` `🔧` `📝` `📏` `⭐`…
Pour mettre en avant, utiliser du **texte** (`IMPORTANT`, `NOTE`, `OBLIGATOIRE`)
ou le gras Markdown.

AUTORISÉ (statut, valeur sémantique) : `⚠️` avertissement · `✅` / `✓` succès ·
`❌` / `✗` erreur · `☑` case cochée. Ils portent une information lue d'un coup
d'œil dans les logs et les tableaux de doc — on les garde.

> Règle identique côté **frontend** (`yaammoo/CLAUDE.md`, R15).
> Un emoji décoratif croisé dans un fichier qu'on touche = le retirer avant de
> clore, même s'il était déjà là. Les emojis de statut, on n'y touche pas.

---

## R20 — Hooks : les règles sont APPLIQUÉES, pas seulement écrites

Trois hooks (`.claude/hooks/`, déclarés dans `.claude/settings.json`) font
respecter ce fichier par le harness. Ils sont **identiques au frontend**
(`yaammoo/.claude/hooks/`), à l'adaptation d'arborescence près.

| Hook | Déclencheur | Effet |
|---|---|---|
| `session-start-read.sh` | `UserPromptSubmit` | Injecte CLAUDE.md + `architecture/README.md` au 1er prompt (R2) |
| `require-architecture-read.sh` | `PreToolUse` | Bloque une recherche sur une feature dont le doc n'a pas été lu, et tout agent Explore/Plan/general-purpose (R2, R3) |
| `no-bash-file-edit.sh` | `PreToolUse` | Refuse Bash pour lire/écrire un fichier — `Read`/`Edit`/`Write` à la place |

**Adaptation backend** de `require-architecture-read.sh` : la feature est
déduite de `src/services/<x>`, `src/controllers/<x>`, `src/routes/<x>` et
`src/repositories/supabase/<x>.repo.js` (le frontend utilise `src/features/` et
`app/(tabs)/`). Les suffixes `.repo` / `.service` / `.controller` sont retirés
avant de chercher `architecture/<x>*.md`.

**Conséquences pratiques** :

- Une feature **sans** `architecture/*.md` n'est pas bloquée — le hook émet une
  NOTE demandant de créer le doc. Rien à maintenir à chaque nouvelle feature.
- `git`, `npm`, `curl`, les pipelines et `> /dev/null` restent libres.
- Un hook qui bloque n'est pas un bug : c'est la règle qui s'applique. Lire le
  doc demandé ou utiliser l'outil dédié — ne jamais contourner.
