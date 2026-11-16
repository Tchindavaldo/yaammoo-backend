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
| yamo (TEST / DEV) | `yamo@` | `xaocrcxnueqxnyfqaayf` | tests, développement | même jeton `api.supabase.com` (compte admin rauval, membre des deux organisations) ; seul autre projet autorisé par le hook |

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

**Hors API de gestion** (commande qui vise la prod par la machine Fly prod, le
stockage, un script lancé avec les clés de la machine) : ces règles de l'API ne
s'appliquent pas ; le hook **demande la validation de l'utilisateur à chaque
appel**, et refuse seulement les suppressions (`DELETE`, `.remove(`, `DROP`,
`TRUNCATE`, bucket vidé). Une commande qui ne vise **que** la base de test
(`xaocrcxnueqxnyfqaayf`) est hors périmètre.

## 4. Migration test → prod

1. Schéma d'abord (tables, index, contraintes, fonctions), sur la prod vide.
   Les `create function` passent par le SQL Editor (collées par l'utilisateur)
   si l'API part en timeout.
2. Données : seulement celles validées par l'utilisateur (réglages `settings_*`,
   comptes, boutique et menus de review), **une table à la fois**, chaque table
   validée. **Jamais** de commandes, paiements, transactions, retraits ni soldes.
3. Contrôle : nombre de lignes source = cible, contraintes présentes.

## 4 bis. Test et prod sont SÉPARÉS (OBLIGATOIRE, décision du 16/11/2026)

- Tout ce qui est fait en test **reste en test**, et tout ce qui est fait en prod reste
  en prod. Aucune donnée d'activité ne passe d'une base à l'autre.
- **Boutique review** (Apple, `hidden_fastfood_ids`) : présente dans les deux bases
  (boutique, menus, comptes), mais **aucune commande, aucun paiement, aucune
  transaction en prod**. Les tests de paiement se font en test.
- Vécu : la migration du 13/11 avait copié en prod les « soldes de review » (la commande
  de test `tpmjUK9lsMg8Ta0dy2gM` du 05/11, son crédit, son retrait). Onze jours plus tard,
  l'annulation d'office l'a annulée : reprise de 320 F au marchand, solde négatif, et
  remboursement impossible (aucune trace de paiement en prod). Données supprimées le
  16/11/2026 avec l'accord de l'utilisateur ; elles restent en test.

## 5. Traçabilité

Chaque appel prod est journalisé par le hook dans `.claude/prod-audit.log`
(gitignoré) : date, session, décision (READ / ASK / DENY), commande.

Le jeton d'accès est le secret réseau `claude-rauval-token` (compte admin
rauval, membre des deux organisations) de l'environnement cloud. Il est
**conservé** après la migration (décision de l'utilisateur, 13/11/2026) : ce
fichier, le hook et le mod `db-guard` restent donc en vigueur.
