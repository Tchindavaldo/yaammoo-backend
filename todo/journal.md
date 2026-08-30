# Journal des corrections récentes

- Statut menu passé à `unavailable` → stock forcé à 0 avant écriture
  (`updateMenu.service.js`).
- Heure de récupération optionnelle en retrait : `delivery.time` (HH:MM) validé
  dès qu'elle est présente (`validateOrder.js`).
- `delivery.phone` requis pour une commande en retrait
  (`validateOrder.js`).