// interfaces/fastfood.js
exports.FastfoodFields = {
  id: { type: 'string', required: false },
  userId: { type: 'string', required: true },
  name: { type: 'string', required: true },
  image: { type: 'string', required: false },
  number: { type: 'string', required: false },
  momoNumber: { type: 'string', required: false },
  whatsappNumber: { type: 'string', required: false },
  openTime: { type: 'string', required: false },
  closeTime: { type: 'string', required: false },
  orderLeadTime: { type: 'number', required: false },
  advanceDays: { type: 'number', required: false },
  // true = le user peut venir récupérer sur place. N'exclut PAS la livraison.
  pickupAllowed: { type: 'bool', required: false },
  cities: { type: 'array', required: false },
  // Jours d'ouverture : entiers 0 (dimanche) … 6 (samedi), sans doublon.
  // [] = n'ouvre jamais → boutique indisponible (`available` calculé).
  openDays: { type: 'array', required: false },
  // Coupure manuelle par le marchand. false = indisponible, `openDays` conservé.
  isAvailable: { type: 'bool', required: false },
  // Position de la boutique (migration 060) : envoyées ensemble, `null` efface.
  // Sert à la distance renvoyée par `GET /fastfood/all` (`distanceKm`).
  // Boissons de la BOUTIQUE (migration 062), envoyées en liste complète via
  // POST /fastfood/:id. Reconstruites dans `menu.drink` à la lecture
  // (services/menu/shopDrinks.js). Validées par `sanitizeShopDrinks`.
  drinks: {
    type: 'array',
    required: false,
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', required: false }, // généré si absent
        name: { type: 'string', required: true },
        prix: { type: 'number', required: true },
        status: { type: 'bool', required: false }, // false = en rupture
        menuIds: { type: 'array', required: false }, // null = tous les plats
      },
    },
  },
  latitude: { type: 'number', required: false },
  longitude: { type: 'number', required: false },
  // Créneaux de livraison PÉRIODIQUE : objets décrits par `DeliveryHourItemFields`.
  // À l'écriture, `utils/deliveryHoursSanitize.js` ne conserve qu'un créneau
  // `periodic` actif ET pourvu de zones valides.
  deliveryHours: {
    type: 'array',
    required: false,
  },
  // Zones EXPRESS de la boutique (migration 073) : UNE liste, sans heure.
  // L'express part dès que la commande est prête : un prix par lieu, jamais par
  // créneau. Zones décrites par `DeliveryZoneFields`, nettoyées à l'écriture.
  expressZones: {
    type: 'array',
    required: false,
  },
};

// Sous-champs d'un créneau (`deliveryHours[]`) : livraison PÉRIODIQUE seule.
// L'express n'est plus porté par les créneaux (migration 073) : il vit dans
// `expressZones`, au niveau de la boutique.
exports.DeliveryHourItemFields = {
  hour: { type: 'string', required: true }, // "HH:mm"
  periodic: { type: 'bool', required: false }, // livraison au créneau activée
  periodicZones: { type: 'array', required: false }, // zones du créneau
};

// Sous-champs d'une zone (`expressZones[]` / `periodicZones[]`).
// Une zone n'est retenue que si `lieu` est non vide et `prix` numérique > 0.
exports.DeliveryZoneFields = {
  lieu: { type: 'string', required: true },
  prix: { type: 'string', required: true }, // envoyé en string par le front ("500")
};
