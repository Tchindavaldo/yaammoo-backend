// ============================================================================
// deliveryHoursSanitize — Nettoyage des zones de livraison à l'écriture
// ----------------------------------------------------------------------------
// Le front renvoie à chaque enregistrement TOUTES les lignes d'heures de son
// état local, y compris celles que le marchand a créées puis vidées. Résultat
// constaté en base : des créneaux avec un mode actif mais aucune zone, donc
// sans aucun prix — inexploitables par le calcul de livraison
// (`services/pricing/deliveryPricing.js` les compte comme zéro zone).
//
// Deux listes, deux règles :
//   - `deliveryHours` (PÉRIODIQUE) : un créneau n'est conservé que s'il est
//     `periodic` ET pourvu de zones valides ;
//   - `expressZones` (EXPRESS, migration 073) : une seule liste par boutique,
//     sans heure. Un lieu n'y figure qu'une fois (le premier gardé).
//
// ⚠️ L'express n'est PLUS porté par les créneaux : `express` / `expressZones`
// reçus dans un créneau sont retirés. Un prix express par heure n'a pas de sens
// (la course part dès que la commande est prête) et laissait l'app et le
// backend lire deux prix différents pour un même lieu.
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

// Vrai si le créneau a le mode périodique actif accompagné de zones valides.
const hasUsableMode = hour => hour.periodic === true && keepValidZones(hour.periodicZones).length > 0;

/**
 * Nettoie un tableau `deliveryHours` reçu du client.
 *
 * - Format legacy (strings "HH:mm") : laissé intact, il ne porte aucune zone et
 *   reste servi tel quel.
 * - Format enrichi (objets) : les créneaux sans mode périodique exploitable sont
 *   retirés, les zones invalides purgées, et les champs express supprimés.
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

    // eslint-disable-next-line no-unused-vars
    const { express, expressZones, ...periodicOnly } = hour;
    kept.push({ ...periodicOnly, periodicZones: keepValidZones(hour.periodicZones) });
  }
  return kept;
};

/**
 * Nettoie la liste `expressZones` de la boutique : zones valides, un lieu une
 * seule fois (doublon repéré sans casse ni espaces de bord), `lieu`/`prix` seuls.
 *
 * @param {unknown} expressZones Valeur brute issue du payload.
 * @returns {Array<{lieu:string, prix:string}>}
 */
const sanitizeExpressZones = expressZones => {
  const seen = new Set();
  const kept = [];
  for (const zone of keepValidZones(expressZones)) {
    const key = zone.lieu.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // `lieu` gardé tel quel : c'est la clé que porte `orders.delivery.zone`.
    kept.push({ lieu: zone.lieu, prix: String(zone.prix) });
  }
  return kept;
};

module.exports = { sanitizeDeliveryHours, sanitizeExpressZones, isValidZone };
