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
  // Créneaux de livraison. Deux formats coexistent en base :
  //   - legacy (app < APP_DELIVERY_NEW_MIN_VERSION) : ["10:00", "14:00"]
  //   - actuel : objets enrichis décrits par `deliveryHourItem` ci-dessous.
  // À l'écriture, `utils/deliveryHoursSanitize.js` ne conserve qu'un créneau
  // ayant au moins un mode (express|periodic) actif ET pourvu de zones valides.
  deliveryHours: {
    type: 'array',
    required: false,
  },
};

// Sous-champs d'un créneau du format enrichi (`deliveryHours[]`).
exports.DeliveryHourItemFields = {
  hour: { type: 'string', required: true }, // "HH:mm"
  express: { type: 'bool', required: false }, // livraison immédiate activée
  periodic: { type: 'bool', required: false }, // livraison au créneau activée
  expressZones: { type: 'array', required: false }, // zones du mode express
  periodicZones: { type: 'array', required: false }, // zones du mode periodic
};

// Sous-champs d'une zone (`expressZones[]` / `periodicZones[]`).
// Une zone n'est retenue que si `lieu` est non vide et `prix` numérique > 0.
exports.DeliveryZoneFields = {
  lieu: { type: 'string', required: true },
  prix: { type: 'string', required: true }, // envoyé en string par le front ("500")
};
