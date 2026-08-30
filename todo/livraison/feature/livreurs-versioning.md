# Feature livreurs (driver) — versioning à surveiller

[ ] Vérifier au fil des évolutions que tout changement de forme reste géré en
    versioning (voir la règle complète dans `CLAUDE.md` § « Versioning par
    version d'app » — détection via `src/utils/appVersion.js`, bascule dans le
    controller, seuil porté par une env dédiée).
    - `GET /order/driver/:driverId`, `PUT /order { id, status, driverId }`,
      events `driverOrderAssigned` / `driverOrderUpdated`.
    - `order.driverId` (nouveau champ) et `user.driverId` : aujourd'hui
      **additifs** (anciens clients les ignorent) → pas de bascule requise pour
      l'instant.
    - Endpoints candidatures (`/driver/apply`, `/driver/applications`,
      `/driver/list`, `/driver/stores`, `/driver/my-applications`) et
      `/fastFood/search` : **nouveaux** → pas de rupture. Mais si on modifie plus
      tard la forme d'un payload déjà consommé (ex. renommer/retyper un champ de
      `DriverApplication`, `StoreOption`, ou le `user` embarqué), **appliquer le
      versioning** (adapter dans le controller, servir l'ancien format aux apps
      < seuil, nouvelle env de bascule, doc).
    - Trancher la forme du `user` embarqué dans les demandes : garder
      `infos.nom/prenom` (FR, cohérent avec `GET /user/:uid`) OU mapper en EN.
      Si on bascule après release front → versioning obligatoire.