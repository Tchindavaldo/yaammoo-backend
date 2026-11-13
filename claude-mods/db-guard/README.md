# db-guard — garde-fou base de prod de Yaammoo

La base **yaammoo** (compte Supabase `yaammoo@`, projet `vcuskusfywrigdrkgnur`)
est celle des vrais clients. Ce mod :

- ajoute `architecture/prod-db-rules.md` (backend yaammoo) au **prompt système à chaque tour** ;
- **refuse** tout appel à la prod si `prod-db-rules.md` n'a pas été relu avec Read dans les 15 dernières minutes ;
- **refuse** les actions destructrices : gestion du compte/projet, `DELETE`/`PATCH`/`PUT`,
  `DROP`, `TRUNCATE`, `DELETE`/`UPDATE` sans `WHERE`, désactivation RLS, jeton envoyé à la main,
  relais des données vers un autre client HTTP ;
- affiche un **bandeau rouge** au-dessus du prompt pendant un travail sur la prod.

Il double le hook du dépôt `.claude/hooks/prod-db-guard.sh`, qui reste la couche garantie
et qui pose la **validation utilisateur à chaque écriture** (`ask`) et le journal
`.claude/prod-audit.log`. Installation automatique : hook SessionStart `install-db-guard.sh`.

Installation à la main :

```
claude plugin marketplace add <chemin du dépôt yaammoo-backend>
claude plugin install db-guard@yaammoo --scope user
```
