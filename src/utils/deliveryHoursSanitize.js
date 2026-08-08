// ============================================================================
// deliveryHoursSanitize — Nettoyage des créneaux de livraison à l'écriture
// ----------------------------------------------------------------------------
// Le front renvoie à chaque enregistrement TOUTES les lignes d'heures de son
// état local, y compris celles que le marchand a créées puis vidées. Résultat
// constaté en base : des créneaux avec `express: true` mais `expressZones: []`,
// donc sans aucun prix — inexploitables par le calcul de livraison
// (`services/pricing/deliveryPricing.js` les compte comme zéro zone).
//
// Règle retenue : un créneau n'est conservé que s'il possède AU MOINS UN mode
// (express ou periodic) à la fois actif ET pourvu de zones valides. Un mode
// désactivé est légitime — une boutique peut ne faire que de l'express.
//
// Une zone est valide si elle porte un `lieu` non vide et un `prix` numérique
// positif. Le `prix` arrive en string depuis le front ("500") : on l'accepte.
// ============================================================================

// Vrai si la zone porte un lieu exploitable et un prix numérique > 0.
const isValidZone = zone => {
  if (!zone || typeof zone !== 'object') return false;
  if (typeof zone.lieu !== 'string' || zone.lieu.trim() === '') return false;
  const prix = Number(zone.prix);
  return Number.isFinite(prix) && prix > 0;
};

// Zones valides d'une liste, dans l'ordre d'origine.
const keepValidZones = list => (Array.isArray(list) ? list.filter(isValidZone) : []);

// Vrai si le créneau a au moins un mode actif accompagné de zones valides.
const hasUsableMode = hour => (hour.express === true && keepValidZones(hour.expressZones).length > 0) || (hour.periodic === true && keepValidZones(hour.periodicZones).length > 0);

/**
 * Nettoie un tableau `deliveryHours` reçu du client.
 *
 * - Format legacy (strings "HH:mm") : laissé intact, il ne porte aucune zone et
 *   reste servi tel quel aux anciennes apps (cf. `deliveryHoursFormat.js`).
 * - Format enrichi (objets) : les créneaux sans mode exploitable sont retirés,
 *   et les zones invalides sont purgées des créneaux conservés.
 *
 * @param {unknown} deliveryHours Valeur brute issue du payload.
 * @returns {Array} Créneaux conservés (tableau vide si l'entrée est invalide).
 */
const sanitizeDeliveryHours = deliveryHours => {
  if (!Array.isArray(deliveryHours)) return [];

  const kept = [];
  for (const hour of deliveryHours) {
    if (typeof hour === 'string') {
      kept.push(hour);
      continue;
    }
    if (!hour || typeof hour !== 'object') continue;
    if (typeof hour.hour !== 'string' || hour.hour.trim() === '') continue;
    if (!hasUsableMode(hour)) continue;

    kept.push({
      ...hour,
      expressZones: keepValidZones(hour.expressZones),
      periodicZones: keepValidZones(hour.periodicZones),
    });
  }
  return kept;
};

module.exports = { sanitizeDeliveryHours, isValidZone };
