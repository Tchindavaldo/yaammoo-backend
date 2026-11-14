# Régime plateforme : l'app ignore les zones Yaammoo (À DISCUTER)

[ ] ⚠️ IMPORTANT — à rappeler à l'utilisateur, point non encore discuté
    - `deliverySource` (`src/services/pricing/deliveryPricing.js`) remplace,
      en régime `platform`, `deliveryHours` par `platformDeliveryZones` et
      `expressZones` par `platformExpressZones` pour le calcul et le contrôle
    - mais `GET /fastfood/all` / `GET /fastfood/:id` servent toujours les zones
      du MARCHAND, que l'app affiche et envoie (`delivery.zone`, `delivery.prix`)
    - risque : `delivery_price_mismatch` au precheck, ou zone absente des
      zones plateforme
    - piste recommandée : servir à l'app les zones effectives du régime dans
      `deliveryHours` / `expressZones` (l'app n'a pas à connaître le régime),
      avec prix d'affichage (`applyDisplayPricing`)
    - fichier jumeau frontend : `todo/plateforme/feature/regime-plateforme-zones.md`
