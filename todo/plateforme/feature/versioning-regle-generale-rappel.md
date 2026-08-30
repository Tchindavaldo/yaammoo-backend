# Versioning par version d'app — règle générale (rappel)

## À gérer dans les prochaines mises à jour

[ ] Tout nouvel endpoint / modif d'endpoint qui **change la forme** des données
    lues côté front → détecter la version client (`src/utils/appVersion.js`,
    header `x-app-version` → fallback `FRONTEND_APP_VERSION`), adapter la
    réponse dans le controller, servir l'ancien format aux anciennes apps,
    documenter le seuil (env dédiée).
[ ] Au déploiement d'une nouvelle version d'app : basculer
    `FRONTEND_APP_VERSION` (et tout seuil concerné) côté Fly
    (`flyctl secrets set FRONTEND_APP_VERSION=x.y.z` + `flyctl deploy`).