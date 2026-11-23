// ============================================================================
// deliveryZones — Lecture des zones de livraison d'une boutique (prix de course)
// ============================================================================
// Sorti de `deliveryPricing.js` (R3, fichier > 500 lignes). Utilisé par tout le
// moteur de prix ; `deliveryPricing` réexporte ces fonctions, les imports
// existants (`require('./deliveryPricing')`) restent valables.
// ============================================================================
const { toNumber } = require('../../utils/toNumber');

// Type de livraison (orders.delivery.type). Un même lieu existe dans les DEUX
// listes à des prix différents : l'express coûte plus cher. Confondre les deux
// crédite le fastfood du mauvais montant.
//
// Les deux listes n'ont PAS la même forme (migration 073) :
//   - PÉRIODIQUE : `deliveryHours[].periodicZones`, un prix par lieu ET par créneau ;
//   - EXPRESS    : `expressZones`, une liste par boutique, SANS heure — la course
//     part dès que la commande est prête. Un prix express par heure laissait
//     l'app et le backend lire deux prix différents pour un même lieu.

/** Zones périodiques, filtrées sur le créneau quand il est connu. */
function collectPeriodicZones(fastfood, hour) {
  const allHours = Array.isArray(fastfood?.deliveryHours) ? fastfood.deliveryHours : [];
  // Créneau donné : seulement ses zones. Un même lieu peut valoir 500 à 09:12
  // et 100 à 13:06 ; lire le premier trouvé versait le mauvais tarif.
  // Créneau absent de la boutique (supprimé depuis) : toutes les heures.
  const slot = hour ? allHours.filter(h => h && typeof h === 'object' && h.hour === hour) : [];
  const hours = slot.length ? slot : allHours;
  const zones = [];
  for (const h of hours) {
    // Le format legacy est un simple "HH:mm" : aucune zone à en tirer.
    if (!h || typeof h !== 'object') continue;
    if (Array.isArray(h.periodicZones)) zones.push(...h.periodicZones);
  }
  return zones;
}

/** Zones express de la boutique : l'heure n'y joue AUCUN rôle. */
function collectExpressZones(fastfood) {
  return Array.isArray(fastfood?.expressZones) ? fastfood.expressZones : [];
}

/**
 * Zones d'une boutique.
 * @param {string} [deliveryType] `express` | `time` — omis, les deux listes.
 * @param {string} [hour] créneau `HH:mm` — ne filtre que le PÉRIODIQUE.
 */
function collectZones(fastfood, deliveryType, hour) {
  let zones;
  if (deliveryType === 'express') zones = collectExpressZones(fastfood);
  else if (deliveryType === 'time') zones = collectPeriodicZones(fastfood, hour);
  else zones = [...collectPeriodicZones(fastfood, hour), ...collectExpressZones(fastfood)];
  return zones.filter(Boolean);
}

/**
 * Livraison la plus chère. Sans type précisé, le maximum est pris sur les DEUX
 * listes : au moment du home le user n'a pas encore choisi son mode de
 * livraison, le prix annoncé doit donc couvrir le cas le plus cher.
 */
function maxDeliveryPrice(fastfood, deliveryType) {
  // ⚠️ `pickupAllowed` n'entre PAS en jeu : il dit que le user peut venir
  // récupérer sur place, pas que la boutique refuse de livrer. Une boutique qui
  // ne livre pas ne déclare simplement aucune zone → 0 naturellement.
  const zones = collectZones(fastfood, deliveryType);
  if (zones.length === 0) return 0;
  return zones.reduce((max, z) => Math.max(max, toNumber(z.prix)), 0);
}

/**
 * Prix réel de la zone choisie — ce que touche le fastfood.
 *
 * ⚠️ La recherche est filtrée par le TYPE de livraison : « Bonanjo » peut valoir
 * 500 en périodique et 900 en express. Sans ce filtre, une course express était
 * créditée au tarif périodique, et l'écart tombait dans la marge plateforme.
 *
 * ⚠️ Et, en PÉRIODIQUE, par le CRÉNEAU (`hour` = `delivery.time`) : le prix
 * d'un lieu dépend de l'heure de départ. L'express n'a pas d'heure : un seul
 * prix par lieu (`expressZones`, migration 073).
 *
 * Zone introuvable : on retombe sur la plus chère du même type, jamais sur 0,
 * pour ne pas créditer la plateforme d'une marge qu'elle n'a pas gagnée.
 */
function zoneDeliveryPrice(fastfood, zoneName, deliveryType, hour) {
  if (!zoneName) return maxDeliveryPrice(fastfood, deliveryType);
  const zone = collectZones(fastfood, deliveryType, hour).find(z => z.lieu === zoneName);
  return zone ? toNumber(zone.prix) : maxDeliveryPrice(fastfood, deliveryType);
}

/**
 * Course la MOINS chère de la boutique (toutes listes, tous créneaux), prix > 0.
 * Sert uniquement à l'aperçu « Vous recevez » d'un prix payé par le marchand
 * (`menuPricePreview`, feePayer `merchant`). 0 si la boutique n'a aucune zone.
 */
function minDeliveryPrice(fastfood) {
  const prices = collectZones(fastfood).map(z => toNumber(z?.prix)).filter(p => p > 0);
  return prices.length ? Math.min(...prices) : 0;
}

module.exports = { collectZones, maxDeliveryPrice, zoneDeliveryPrice, minDeliveryPrice };
