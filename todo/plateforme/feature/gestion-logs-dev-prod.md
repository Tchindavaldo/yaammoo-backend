# Gestion automatique des logs (dev vs prod)

[ ] Centraliser les logs derrière un logger unique au lieu des `console.log` /
    `console.info` dispersés dans les services et controllers.
    - Les logs de **debug/info** ne s'affichent qu'en développement ; en
      production ils sont silencieux. `warn` et `error` restent actifs partout.
    - Niveau piloté par une env dédiée (ex. `LOG_LEVEL`, défaut `debug` en dev /
      `warn` en prod) — jamais de valeur en dur (R10).
    - Fournir `log.debug / info / warn / error` avec la même signature que
      `console`, pour un remplacement mécanique fichier par fichier.
    - Conserver le format actuel des préfixes (`[Transaction] userId=...`) : ils
      servent au diagnostic et au parsing (R17).
    - Migrer ensuite les appels existants (`const log = console;` en tête de
      plusieurs services) vers ce logger.