# Normalisation FR → EN des noms de champs (chantier transverse)

[ ] Uniformiser en anglais les noms de champs encore en français, d'abord au
    niveau des payloads renvoyés au front (ex. `user.infos.nom/prenom` →
    `firstName/lastName`, `numero` → `phone`, etc.), puis **à terme les colonnes
    des tables encore nommées en français** (ex. `users.nom/prenom/numero`,
    `menus.titre`, `delivery.prix/zone`, ...).
    - ⚠️ **Rupture de forme** → à faire OBLIGATOIREMENT sous versioning (adapter
      la réponse dans le controller, servir l'ancien format aux apps < seuil,
      env de bascule dédiée) sinon on casse les apps déjà en prod.
    - Séquencer : (1) mappers renvoient les 2 formats un temps, (2) bascule
      front, (3) montée du seuil, (4) migration SQL de renommage des colonnes en
      dernier.