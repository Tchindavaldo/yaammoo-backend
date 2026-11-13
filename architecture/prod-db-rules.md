# BASE DE PROD — règles obligatoires (R23, mod db-guard)

> La base **yaammoo** (compte Supabase `yaammoo@`, projet `vcuskusfywrigdrkgnur`,
> eu-central-1) est celle des **vrais clients**. Une erreur = des comptes, des
> commandes ou de l'argent réels perdus. Ces règles sont injectées dans le
> prompt système à chaque tour (mod `db-guard`) et appliquées par hook
> (`.claude/hooks/prod-db-guard.sh`).

## 0. Les deux bases

| Base | Compte Supabase | Projet | Usage | Accès agent |
|---|---|---|---|---|
| **yaammoo (PROD)** | `yaammoo@` | `vcuskusfywrigdrkgnur` | vrais clients, versions de prod | API de gestion `api.supabase.com`, jeton injecté par le proxy |
| yamo (TEST / DEV) | `yamo@` | `xaocrcxnueqxnyfqaayf` | tests, développement | connecteur MCP Supabase |

Le projet de test s'appelle aussi « yaammoo » dans son dashboard : on identifie
une base **par son id de projet**, jamais par son nom.

## 1. Avant CHAQUE requête sur la prod

1. Dire en **une phrase** ce que fait la requête et pourquoi (même en lecture).
2. Vérifier que l'id de projet visé est le bon (`vcuskusfywrigdrkgnur` = prod).
3. Lecture d'abord : compter / lister avant toute écriture.

## 2. Écriture (insert, update, delete, DDL)

- **Jamais sans l'accord explicite de l'utilisateur**, donné pour CETTE requête.
  Le hook redemande la validation à chaque écriture, même en mode automatique.
- **Sauvegarde avant** toute écriture de masse ou DDL (dump de la table ou du
  schéma concerné, gardé hors du dépôt).
- Une écriture = un périmètre précis (`WHERE` sur une clé). Pas de requête
  multi-tables fourre-tout.
- **Tables d'argent** (`transactions`, `order_settlements`, `order_deliveries`,
  `withdrawals`, `pending_payments`, `transaction_settlements`,
  `platform_revenues`, `settings_pricing|withdrawal|delivery`,
  `platform_transfer_locks`, `app_errors`) : en plus, relecture de
  `architecture/money-rules.md` < 15 min (R22) et trace dans `app_errors` pour
  toute régularisation.
- Après l'écriture : relire et comparer (nombre de lignes, valeurs).

## 3. Interdit (refusé par le hook, sans exception)

- Supprimer, mettre en pause, restaurer, upgrader le projet ; toucher aux clés
  API, secrets, branches, réseau, SSL, domaines, facturation, config auth.
- Méthodes `DELETE`, `PATCH`, `PUT` sur l'API de gestion.
- `DROP DATABASE|SCHEMA|TABLE|OWNED|ROLE|USER`, `TRUNCATE`, `ALTER ROLE|USER`,
  `pg_terminate_backend`, `COPY … PROGRAM`, lecture de fichiers serveur.
- `DELETE FROM <table>` sans `WHERE`.
- Envoyer un jeton à la main (`Authorization:`, `sbp_…`) : le proxy l'injecte.
- Copier des données de prod vers la base de test ou ailleurs (données clients).

Si une de ces actions est vraiment nécessaire, **l'utilisateur la fait lui-même**
dans le dashboard Supabase.

## 4. Migration test → prod

1. Schéma d'abord (tables, index, contraintes, fonctions), sur la prod vide.
   Les `create function` passent par le SQL Editor (collées par l'utilisateur)
   si l'API part en timeout.
2. Données : seulement celles validées par l'utilisateur (réglages `settings_*`,
   comptes et soldes de review issus de pawaPay), **une table à la fois**,
   chaque table validée.
3. Contrôle : nombre de lignes source = cible, contraintes présentes.

## 5. Traçabilité

Chaque appel prod est journalisé par le hook dans `.claude/prod-audit.log`
(gitignoré) : date, session, décision (READ / ASK / DENY), commande.

Le jeton `claude-token` (compte `yaammoo@`) est révoqué par l'utilisateur à la
fin de la migration : https://supabase.com/dashboard/account/tokens
