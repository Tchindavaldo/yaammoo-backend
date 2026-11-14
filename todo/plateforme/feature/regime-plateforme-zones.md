# Régime plateforme : servir à l'app les zones et prix Yaammoo

[x] (fait le 14/11/2026, applyDisplayPricing, dev) DÉCIDÉ le 14/11/2026 : en régime `platform`, l'app ne voit QUE les zones
    et prix de la plateforme (`platformDeliveryZones` / `platformExpressZones`,
    posés par l'admin via le controller `deliveryConfig`), jamais ceux du marchand
    - `GET /fastfood/all` et `GET /fastfood/:id` : renvoyer ces zones dans
      `deliveryHours` / `expressZones` (prix d'affichage `applyDisplayPricing`),
      pour que l'app reste muette sur le régime
    - `deliverySource` (`src/services/pricing/deliveryPricing.js`) calcule déjà
      avec ces zones : affichage et contrôle seront alors alignés
      (plus de `delivery_price_mismatch` ni de zone inconnue)
    - fichier jumeau frontend : `todo/plateforme/feature/regime-plateforme-zones.md`
