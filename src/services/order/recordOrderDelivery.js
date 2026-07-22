// ============================================================================
// recordOrderDelivery — Vérité comptable de la livraison d'une commande
// ============================================================================
// Écrit dans `order_deliveries` (migration 020) les trois montants que
// `orders.delivery.prix` ne peut pas distinguer :
//
//   realPrice      → ce que touche le fastfood (zone réellement choisie)
//   chargedPrice   → ce qui a été facturé au user (livraison la plus chère,
//                    déjà fondue dans le prix affiché du plat)
//   platformMargin → l'écart + la marge plateforme. JAMAIS négatif.
//
// ⚠️ Non bloquant : la commande est déjà créée quand on arrive ici. Un incident
// d'écriture comptable ne doit pas faire échouer une commande payée. On
// journalise bruyamment — c'est une perte de données comptables, pas un détail.
// ============================================================================
const repos = require('../../repositories');
const { splitDeliveryAmounts } = require('../pricing/deliveryPricing');

/**
 * @param {Object} order          commande créée
 * @param {Object|null} offer     `deliveryOffer` appliqué (null si livraison facturée)
 * @param {number} platformMargin marge plateforme (settings)
 */
exports.recordOrderDelivery = async ({ order, offer, platformMargin }) => {
  try {
    if (!order?.id) return null;
    // Retrait sur place : rien à répartir.
    if (order.delivery?.status !== true) return null;

    const fastfood = await repos.fastfoods.getById(order.fastFoodId);
    const amounts = splitDeliveryAmounts({
      fastfood,
      zone: order.delivery?.zone,
      platformMargin,
      // Le supplément est facturé par plat, la course n'est versée qu'une fois.
      quantity: order.quantity,
      freeReason: offer?.reason ?? null,
    });

    return await repos.orderDeliveries.create({
      orderId: order.id,
      userId: order.userId,
      fastFoodId: order.fastFoodId,
      ...amounts,
      coveredBy: offer?.coveredBy ?? null,
      bonusId: offer?.bonusId ?? null,
      bonusCode: offer?.bonusCode ?? null,
    });
  } catch (error) {
    console.error('recordOrderDelivery: écriture comptable échouée (commande conservée) —', error.message);
    return null;
  }
};
