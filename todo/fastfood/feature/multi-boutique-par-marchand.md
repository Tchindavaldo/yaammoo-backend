# Multi-boutique : un marchand peut posséder plusieurs boutiques

[ ] Lever la limite « 1 user = 1 boutique » pour qu'un marchand gère plusieurs
    points de vente sous le même compte.
    - **Blocage DB** : `fastfoods_user_unique UNIQUE (user_id)` (schema.sql).
      Migration à prévoir pour la retirer — c'est elle qui rend le modèle actuel
      strictement 1:1.
    - **Blocage code** : `createFastfoodService` refuse explicitement une 2e
      boutique (« Cet utilisateur possède déjà une fastfood »), et
      `repos.fastfoods.getByUserId()` fait un `maybeSingle()` — il faudra un
      `getAllByUserId()` renvoyant une liste.
    - **`user.fastFoodId` (singulier)** : le champ porte aujourd'hui LA boutique
      du marchand, et `isMarchand` en est dérivé (R5). Avec N boutiques il
      devient ambigu.
      - ⚠️ **R11 s'applique** : le frontend lit `fastFoodId` — le transformer en
        tableau casse les apps déjà publiées. Prévoir seuil de version + env
        dédiée, et servir l'ancien format (la boutique « principale ») aux
        anciennes versions. `isMarchand` reste dérivé : `true` dès qu'il existe
        au moins une boutique.
    - **Boutique courante** : le marchand doit pouvoir basculer d'une boutique à
      l'autre (commandes, menus, retraits sont tous scopés `fastFoodId`).
      Décider où vit ce contexte — sélecteur côté front avec `fastFoodId`
      explicite dans chaque requête, plutôt qu'un état serveur.
    - **À auditer** : tout ce qui suppose « le » fastFood d'un user — retraits
      (`withdrawals`), stats livreur, notifications marchand, candidatures
      livreur, bonus boutique.
    - **Suppression admin** : `soft_delete_fastfood` vide `users.fastfood_id`
      (migration 047). En multi-boutique, ne vider que si c'était CETTE
      boutique-là, et rebasculer sur une autre restante s'il y en a.
      Voir `architecture/merchants.md#suppression-admin-dune-boutique-soft-delete`.
