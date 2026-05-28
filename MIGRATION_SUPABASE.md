# Migration Firestore → Supabase

Ce document décrit comment migrer la base de données du backend Yaammoo de Firestore vers Supabase PostgreSQL.

**Ce qui reste sur Firebase :** Auth, FCM (push notifications), Storage.
**Ce qui passe sur Supabase :** toutes les données métier (users, fastfoods, menus, orders, etc.).

---

## Vue d'ensemble

L'architecture utilise un **pattern repository** avec un orchestrateur central (`src/repositories/index.js`) qui route les appels vers Firestore et/ou Supabase selon la variable d'environnement `DB_PROVIDER`.

- `firestore` (défaut) : comportement actuel, rien ne change
- `dual` : écritures sur les deux DBs, lectures depuis `DB_READ_FROM`
- `supabase` : migration terminée, Firestore désactivé

Cette stratégie permet une bascule **sans downtime** et avec rollback facile.

---

## Procédure complète

### 1. Installer la dépendance Supabase

```bash
cd BACKEND
npm install
```

### 2. Créer le schéma sur Supabase

1. Va sur https://supabase.com/dashboard → ton projet → **SQL Editor**
2. Ouvre [src/db/schema.sql](src/db/schema.sql)
3. Copie tout le contenu et exécute-le dans le SQL Editor
4. Vérifie que toutes les tables sont créées : **Table Editor** → tu dois voir `users`, `fastfoods`, `menus`, `orders`, `rank_counters`, `transactions`, `bonus`, `bonus_requests`, `notifications`, `user_push_tokens`, `user_fcm_tokens`

### 3. Vérifier les variables d'environnement

Dans [.env](.env), tu dois avoir :

```bash
SUPABASE_URL=https://wstxaaissoktoiikgifu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # service_role key (full access, garde-la secrète)
DB_PROVIDER=firestore              # encore Firestore pour l'instant
DB_READ_FROM=firestore
```

### 4. Migrer les données existantes

```bash
cd BACKEND
npm run migrate:to-supabase
```

Ce script copie toutes les collections Firestore vers les tables Supabase. Il est **idempotent** (UPSERT par PK), donc relançable sans risque.

Tu peux aussi migrer une seule collection pour tester :

```bash
node scripts/migrate-firestore-to-supabase.js users
node scripts/migrate-firestore-to-supabase.js menus
```

### 5. Valider la migration

```bash
npm run migrate:validate
```

Affiche un tableau comparatif Firestore vs Supabase pour chaque collection :

```
Collection (FS)      Table (SB)                FS       SB       Δ
----------------------------------------------------------------------
users                users                     42       42       0✅
fastfoods            fastfoods                  8        8       0✅
menus                menus                    103      103       0✅
orders               orders                   587      587       0✅
...
```

Si tout est à 0, la migration est conforme.

### 6. Basculer en mode dual-write (recommandé)

Dans `.env` :

```bash
DB_PROVIDER=dual
DB_READ_FROM=firestore
```

Redémarre le backend. À partir de maintenant :
- **Reads** → depuis Firestore (comme avant)
- **Writes** → sur Firestore ET Supabase

Laisse tourner quelques jours/heures pour t'assurer que tout fonctionne. Si une écriture Supabase échoue, c'est juste un `warn` dans les logs — le service ne tombe pas.

### 7. Basculer les reads sur Supabase

Quand tu es confiant :

```bash
DB_PROVIDER=dual
DB_READ_FROM=supabase
```

Reads viennent maintenant de Supabase, writes vont toujours sur les deux. C'est l'étape de **vérification en lecture**.

Surveille les logs et l'app pendant 1-2 jours.

### 8. Bascule finale (Firestore off)

```bash
DB_PROVIDER=supabase
# DB_READ_FROM ignoré
```

Firestore est complètement débranché. Migration terminée.

---

## Rollback

À n'importe quelle étape entre 6 et 8, tu peux revenir en arrière en remettant `DB_PROVIDER=firestore` dans `.env` et en redémarrant. Les données Firestore restent intactes tant que tu n'as pas explicitement supprimé la base.

---

## Structure du code

| Chemin | Rôle |
|---|---|
| [src/db/schema.sql](src/db/schema.sql) | Schéma SQL complet (tables + fonctions PL/pgSQL pour ranking atomique) |
| [src/config/supabase.js](src/config/supabase.js) | Client Supabase admin (service_role) |
| [src/config/dbProvider.js](src/config/dbProvider.js) | Feature flag DB_PROVIDER + validation |
| [src/repositories/mappers.js](src/repositories/mappers.js) | Conversion Firestore ↔ Supabase (camelCase ↔ snake_case, ISO ↔ TIMESTAMPTZ) |
| [src/repositories/idGen.js](src/repositories/idGen.js) | Générateur d'IDs compatibles Firestore (20 chars alphanum) |
| [src/repositories/firestore/](src/repositories/firestore/) | Wrappers Firestore (sémantique stable) |
| [src/repositories/supabase/](src/repositories/supabase/) | Repositories Supabase (PostgreSQL via Supabase client) |
| [src/repositories/index.js](src/repositories/index.js) | Orchestrateur : route les appels selon DB_PROVIDER |
| [scripts/migrate-firestore-to-supabase.js](scripts/migrate-firestore-to-supabase.js) | Migration des données existantes |
| [scripts/validate-migration.js](scripts/validate-migration.js) | Validation des compteurs post-migration |

---

## Points techniques importants

### Transactions de ranking (le plus délicat)

Le système Firestore utilise `db.runTransaction(...)` pour assigner des rangs atomiques aux commandes dans une file (évite que deux commandes simultanées aient le même rang).

Côté Supabase, c'est implémenté avec des **fonctions PL/pgSQL** (`reserve_rank`, `assign_rank`, `reindex_queue`, `create_order_with_stock_check`) qui s'exécutent dans une seule transaction PostgreSQL — **atomicité native, sans risque de race condition**.

### State machine des commandes

La logique de transition (`pendingToBuy → pending → processing → finished → delivering → delivered`) reste **dans le code Node.js** (service `updateOrders.service.js`). Les fonctions SQL ne font que les opérations atomiques (assignment rank, reindex queue, stock check).

Cette séparation a été choisie pour garder la logique métier lisible dans Node, et déléguer à PostgreSQL uniquement ce qui doit être atomique.

### FieldValue spéciaux

| Firestore | Équivalent Supabase |
|---|---|
| `arrayUnion(token)` | INSERT dans `user_push_tokens` ou `user_fcm_tokens` (PK composite) |
| `arrayRemove(token)` | DELETE FROM `user_push_tokens/user_fcm_tokens` |
| `FieldValue.delete()` | UPDATE SET ... = NULL (champs `rank`, `client_id`, `period_key`) |
| `serverTimestamp()` | `NOW()` ou `DEFAULT NOW()` (mais le code utilise déjà `new Date().toISOString()`) |

### IDs préservés

Les IDs Firestore sont conservés tels quels dans les tables Supabase (PK en TEXT). Les nouveaux documents créés via Supabase utilisent le même format (20 chars alphanum — voir [idGen.js](src/repositories/idGen.js)).

### Structures imbriquées

- `users.infos.{nom, prenom, ...}` → dénormalisé en colonnes plates (`users.nom`, `users.prenom`, ...)
- `users.pushTokens[]` → table dédiée `user_push_tokens`
- `users.fcmTokens[]` → table legacy `user_fcm_tokens`
- `orders.menu` → JSONB `orders.menu_snapshot` (snapshot du menu au moment de la commande)
- `orders.delivery` → JSONB (forme variable)
- `menus.extra`, `menus.drink` → JSONB
- `notifications.allNotif[]` → JSONB (mutations via fonction `append_notification`)
- `bonus_requests.status[]` → JSONB (array d'historique de statuts)

### Champs `extra_data`

Chaque table a une colonne JSONB `extra_data` qui capture les champs Firestore non mappés explicitement. Ça évite de perdre des données pendant la migration et permet de gérer des évolutions de schéma souples.

---

## Limites / futurs travaux

- **Services autres que `userService`** : actuellement seul `userService.js` est passé en façade. Les autres services (`fastfood`, `menu`, `order`, etc.) écrivent encore directement dans Firestore. Pour les migrer, il faut faire la même chose : remplacer le contenu par des appels à `repos.<domain>`. Les repositories Supabase pour ces domaines sont déjà prêts dans `src/repositories/supabase/`.
- **Realtime Supabase** : non utilisé. On garde Socket.io comme avant.
- **Row Level Security (RLS)** : non activé pour l'instant (le backend utilise `service_role` qui bypass RLS). À activer si tu exposes Supabase directement au client mobile plus tard.

---

## Dépannage

**`SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant`**
→ Vérifie `.env`. Le client Supabase tolère l'absence (mode firestore-only).

**`relation "users" does not exist`**
→ Le schéma n'a pas été exécuté sur Supabase. Re-exécute `src/db/schema.sql` dans le SQL Editor.

**`function reserve_rank(...) does not exist`**
→ Les fonctions PL/pgSQL n'ont pas été créées. Re-exécute la partie `FONCTIONS ATOMIQUES` du schéma.

**Compteurs divergent après migration**
→ Relance `npm run migrate:to-supabase <collection>` pour la collection qui diverge. C'est idempotent.

**Une écriture échoue en mode dual**
→ Si le primary (selon `DB_READ_FROM`) échoue, l'erreur remonte. Si le secondary échoue, c'est juste un warn dans les logs — le primary réussit quand même.

---

## TODO — Bugs à corriger avant la suppression complète de Firestore

À tester en condition réelle dans l'app, puis corriger côté Supabase si reproduits :

### RPC `reindex_queue` — notifications dupliquées
- **Fichier** : [src/db/schema.sql](src/db/schema.sql) lignes ~310-368
- **Symptôme** : à l'annulation d'une commande au milieu de la file, les commandes suivantes sont retournées 2× (via `WITH updated` puis `RETURN QUERY`) → notifications push envoyées en double aux clients qui changent de position.
- **Fix** : supprimer la duplication dans le RETURN QUERY de la fonction.

### RPC `append_notification` — groupes fragmentés
- **Fichiers** : [src/db/schema.sql](src/db/schema.sql) lignes ~483-527 et [src/repositories/supabase/notifications.repo.js:62-73](src/repositories/supabase/notifications.repo.js)
- **Symptôme** : `p_group_id` est généré côté Node à chaque appel au lieu de réutiliser le `group_id` existant du user/fastfood → un user peut accumuler N groupes au lieu d'1 seul.
- **Fix** : faire générer le `group_id` par la fonction PL/pgSQL quand aucun groupe existant n'est trouvé.

### RPC `create_order_with_stock_check` — `new_stock` absent en cas d'erreur
- **Fichier** : [src/db/schema.sql](src/db/schema.sql) lignes ~401-474
- **Symptôme** : quand le stock est insuffisant, le retour JSONB contient `error` mais pas `new_stock` → le frontend reçoit `newStock: undefined`.
- **Fix** : inclure `new_stock` dans le payload d'erreur.

### Read-modify-write côté Supabase (race condition possible)
- **Fichiers** : [supabase/orders.repo.js:109-133](src/repositories/supabase/orders.repo.js), `menus.update()`, `users.saveUser()`, `fastfoods.update()`
- **Symptôme** : `update()` fait un `getById` puis merge en mémoire → sous concurrence, deux updates parallèles peuvent perdre des champs.
- **Fix** : faire un `UPDATE` direct sans relecture quand le payload n'a pas besoin du précédent état.

### Recherche user par email — utilisateurs legacy
- **Fichier** : [supabase/users.repo.js:153-163](src/repositories/supabase/users.repo.js)
- **Symptôme** : Firestore stockait `infos.email` nested ; Supabase utilise la colonne plate `email`. Si la migration n'a pas dénormalisé tous les users legacy, ils ne pourront pas se reconnecter.
- **Fix** : vérifier que tous les users migrés ont bien `email` rempli, ou ajouter un fallback de recherche.
