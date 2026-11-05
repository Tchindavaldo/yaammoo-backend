# money-guard — garde-fou argent de Yaammoo

Yaammoo manipule de l'argent réel. Ce mod :

- ajoute `architecture/money-rules.md` (backend yaammoo) au **prompt système à chaque tour** ;
- **refuse** toute modification d'un fichier d'argent, toute écriture SQL sur une table d'argent
  et tout déploiement si `money-rules.md` n'a pas été relu avec Read dans les 15 dernières minutes.

Il double les hooks du dépôt (`.claude/hooks/require-money-rules.sh`, `money-context.sh`), qui
restent la couche garantie. Installation automatique : hook SessionStart `install-money-guard.sh`.

Installation à la main :

```
claude plugin marketplace add <chemin du dépôt yaammoo-backend>
claude plugin install money-guard@yaammoo --scope user
```
