# Livreur neuf par commande EXPRESS

[ ] Par défaut, affecter une commande EXPRESS à un livreur qui vient de
    terminer, au lieu de l'ajouter à la pile d'un livreur déjà chargé.
    - **Pourquoi 1 — la vitesse.** L'express se paie plus cher parce qu'il part
      tout de suite. Un livreur qui a déjà 3 courses en attente ne peut pas tenir
      cette promesse, quelle que soit sa position.
    - **Pourquoi 2 — le prix de la course.** Un livreur qui cumule plusieurs
      commandes de la MÊME zone ne fait qu'UN déplacement : on lui verse N
      courses pour un seul trajet. La logique `deliveryGroupKey` ne regroupe que
      les commandes d'un même panier — deux paniers distincts vers la même zone
      échappent au regroupement et coûtent deux courses.
    - **Deux cas à gérer**, côté plateforme (`deliveryBy = 'platform'`), pour
      savoir lequel est gagnant :
      1. commandes de zones DIFFÉRENTES chez un même livreur → chaque course est
         due, pas de perte ;
      2. commandes de la MÊME zone, paniers différents → une seule course
         réellement effectuée, N facturées. C'est là que la plateforme perd.
    - Décider si le regroupement inter-paniers doit exister (et alors élargir la
      clé de groupe au-delà du panier), ou si l'affectation à un livreur libre
      suffit à l'éviter en pratique.
    - Voir [architecture/pricing.md](./architecture/pricing.md) § « Une seule
      course par départ » et `services/pricing/deliveryGroupKey.js`.