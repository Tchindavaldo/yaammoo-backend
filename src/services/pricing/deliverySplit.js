// ============================================================================
// deliverySplit — Répartition d'une commande livrée (`order_deliveries`)
// ============================================================================
// Sorti de `deliveryPricing.js` (plafond de 500 lignes, R3) : ce module ne
// compose aucun prix, il RÉPARTIT ce qui a été facturé au titre de la
// livraison entre la course due et la marge. Seul `settleDelivery` l'utilise.
// ============================================================================
const { toNumber, deliverySource, isPlatformDelivered, maxDeliveryPrice, zoneDeliveryPrice, expressZoneDisplayPrice, PLATFORM_DISPLAY_ZONE_TYPE } = require('./deliveryPricing');

/**
 * Répartition d'une commande livrée, pour `order_deliveries`.
 *
 * ⚠️ **Asymétrie voulue** : le supplément est porté par le prix unitaire du
 * plat, donc facturé sur CHAQUE exemplaire (`× quantity`) ; le fastfood, lui,
 * ne touche qu'UNE course par panier et par boutique. Tout l'écart revient à la
 * plateforme — c'est le levier de marge.
 *
 * `courseBilled: false` → cette commande partage la course d'une autre du même
 * panier. `realPrice` reste renseigné (traçabilité), mais n'est pas dû.
 *
 * ⚠️ `platformMargin` PEUT être négatif (migration 038). Tant que la zone max
 * était fondue dans le prix, une gratuité ne faisait que renoncer à un gain. La
 * marge fastfood ne portant plus de zone, offrir une course chère coûte
 * réellement de l'argent — et ce coût doit être tracé, pas borné à 0.
 */
function splitDeliveryAmounts({ fastfood, zone, deliveryType, deliveryHour = null, platformMargin, pricing, quantity = 1, courseBilled = true, delivered = true, freeReason = null }) {
  const qty = Math.max(1, toNumber(quantity) || 1);

  // Facturé au user au titre de la LIVRAISON, dans le prix du plat.
  //
  // Régime PLATEFORME : la zone périodique est fondue dans le prix affiché,
  // autant de fois qu'il y a de plats. Facturée MÊME EN RETRAIT — le supplément
  // est intégré depuis le home, avant que le user ait choisi ; s'il vient
  // chercher lui-même, il n'y a aucune course à verser et le montant part
  // intégralement en marge. C'est le modèle économique retenu, pas un oubli.
  //
  // Régime FASTFOOD : plus aucune zone n'est fondue dans le prix du plat — la
  // course est facturée à part, au tarif réel. Rien n'est donc « chargé » ici,
  // et une commande en retrait ne porte plus de livraison fantôme.
  //
  // ⚠️ La liste consultée est la MÊME que celle de la composition
  // (`PLATFORM_DISPLAY_ZONE_TYPE`). Sans ce filtre, on facturait le max des deux
  // listes — soit l'express (400) alors que le prix affiché portait le
  // périodique (250) : 150 F de marge fantôme par commande.
  //
  // ⚠️ L'EXPRESS s'ajoute par-dessus : sa zone est facturée à part, tous frais
  // inclus (`applyExpressZonePricing`), et une SEULE fois — c'est une course,
  // pas un supplément par plat. Sans elle, le montant réellement encaissé
  // manquait à l'appel et le livreur en faisait les frais.
  const source = deliverySource(fastfood);
  const platformDelivered = isPlatformDelivered(fastfood);
  const periodicCharged = platformDelivered ? maxDeliveryPrice(source, PLATFORM_DISPLAY_ZONE_TYPE) * qty : 0;
  const expressCharged = platformDelivered && delivered && courseBilled && deliveryType === 'express' ? expressZoneDisplayPrice(source, zone, pricing) : 0;
  const chargedPrice = periodicCharged + expressCharged;

  // Pas de livraison = pas de course : rien n'est dû au fastfood.
  // Tarif lu dans le CRÉNEAU choisi (`deliveryHour`) : un lieu n'a pas le même
  // prix à toutes les heures.
  const realPrice = delivered ? zoneDeliveryPrice(source, zone, deliveryType, deliveryHour) : 0;
  const due = delivered && courseBilled ? realPrice : 0;

  return {
    zone: delivered ? (zone ?? null) : null,
    realPrice,
    chargedPrice,
    // Sans livraison, aucune course n'est portée par cette commande.
    courseBilled: delivered && courseBilled,
    delivered,
    // PEUT être négatif : une course offerte est versée au fastfood sans avoir
    // été encaissée. Borner à 0 masquerait le coût réel du bonus.
    platformMargin: chargedPrice - due + toNumber(platformMargin) * qty,
    freeReason,
  };
}

module.exports = { splitDeliveryAmounts };
