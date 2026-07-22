// ============================================================================
// settleDeliveryService — Règlement des livraisons au passage en `pending`
// ============================================================================
// **Déclenché quand la commande devient RÉELLE (payée), jamais à la mise au
// panier** : un panier peut encore être vidé, on ne facture rien tant qu'il
// n'est pas payé.
//
// Deux appelants, parce que le workflow a deux chemins :
//   • panier       → updateOrders (transition pendingToBuy → pending). Le lot
//                    arrive en UN SEUL appel : c'est lui, le panier.
//   • achat direct → createOrderService, uniquement si status === 'pending'.
//
// Ce que fait ce module :
//   1. UNE seule course par boutique. Une commande = un plat, donc un panier de
//      3 plats fait 3 commandes — mais le livreur ne se déplace qu'une fois.
//      Les autres lignes gardent leur `realPrice` (traçabilité) avec
//      `courseBilled = false`, et `deliveryGroupId` les relie.
//   2. Le bonus est consommé UNE fois pour le lot, pas une fois par plat.
//   3. Écriture de la vérité comptable dans `order_deliveries`.
//
// Non bloquant : les commandes existent déjà quand on arrive ici. Un incident
// comptable ne doit pas casser une commande payée — il est journalisé.
// ============================================================================
const repos = require('../../repositories');
const { generateId } = require('../../repositories/idGen');
const { getPricingSettings } = require('../settings/settings.service');
const { resolveOffer } = require('../pricing/deliveryOfferResolver');
const { resolveDeliveryBonus, consumeDeliveryBonus } = require('../bonus/applyDeliveryBonus.service');
const { splitDeliveryAmounts, toNumber, feeIncludedIn } = require('../pricing/deliveryPricing');

/**
 * @param {Array}  orders     commandes venant de passer en `pending`
 * @param {string} [bonusCode] code bonus présenté pour le lot
 * @returns {Promise<{offer: Object|null, deliveries: Array}>}
 */
exports.settleDeliveryService = async ({ orders, bonusCode }) => {
  const settled = { offer: null, deliveries: [] };
  const list = (Array.isArray(orders) ? orders : [orders]).filter(o => o && o.id);
  if (list.length === 0) return settled;

  try {
    const pricing = await getPricingSettings();
    const userId = list[0].userId;

    // ── Bonus : résolu UNE fois pour le lot ─────────────────────────────────
    // Un bonus vaut pour une commande, pas pour chaque plat du panier. On le
    // résout sur la boutique de la première commande qui peut y prétendre.
    let bonusResolution = null;
    for (const order of list) {
      const attempt = await resolveDeliveryBonus({ userId, fastFoodId: order.fastFoodId, bonusCode });
      // Un code explicitement fourni et invalide ne doit pas faire échouer un
      // paiement déjà encaissé : on journalise et on continue sans gratuité.
      if (attempt?.error) {
        console.warn('settleDelivery: bonus refusé —', attempt.error);
        break;
      }
      if (attempt?.bonus) {
        bonusResolution = { ...attempt, fastFoodId: order.fastFoodId };
        break;
      }
    }

    // Une campagne globale PRIME et laisse le bonus intact : le brûler pendant
    // une gratuité générale serait une perte sèche pour le user.
    const { offer, consumeBonus } = resolveOffer(pricing.deliveryFreeMode, bonusResolution?.offer || null);
    settled.offer = offer;

    if (consumeBonus && bonusResolution?.bonus) {
      settled.offer = await consumeDeliveryBonus({ ...bonusResolution, orderId: list[0].id });
    }

    // ── Une seule course par boutique ───────────────────────────────────────
    const groupIdByFastFood = {};
    const billedFastFoods = new Set();

    for (const order of list) {
      // Retrait sur place : rien à répartir côté livraison.
      if (order.delivery?.status !== true) continue;

      const ffId = order.fastFoodId;
      if (!groupIdByFastFood[ffId]) groupIdByFastFood[ffId] = generateId();

      const courseBilled = !billedFastFoods.has(ffId);
      billedFastFoods.add(ffId);

      const fastfood = await repos.fastfoods.getById(ffId);

      // L'offre ne vaut que pour la boutique concernée (ou partout si campagne
      // / bonus plateforme).
      const applies = !offer || offer.fastFoodId == null || offer.fastFoodId === ffId;
      const orderOffer = applies ? settled.offer : null;

      const amounts = splitDeliveryAmounts({
        fastfood,
        zone: order.delivery?.zone,
        platformMargin: pricing.platformMargin,
        quantity: order.quantity,
        courseBilled,
        freeReason: orderOffer?.reason ?? null,
      });

      // `order.total` est déjà TTC : les frais y sont inclus, on les EXTRAIT.
      const itemsCharged = toNumber(order.total);
      const paymentFee = feeIncludedIn(itemsCharged, pricing.paymentFeePercent);
      const qty = Math.max(1, toNumber(order.quantity) || 1);

      // Ce qui revient au fastfood pour les articles : on retire des montants
      // encaissés tout ce qui ne lui appartient pas — frais, livraison, marge.
      const itemsReal = Math.max(0, itemsCharged - paymentFee - amounts.chargedPrice - toNumber(pricing.platformMargin) * qty);

      try {
        const row = await repos.orderDeliveries.create({
          orderId: order.id,
          userId: order.userId,
          fastFoodId: ffId,
          deliveryGroupId: groupIdByFastFood[ffId],
          ...amounts,
          itemsCharged,
          itemsReal,
          paymentFee,
          coveredBy: orderOffer?.coveredBy ?? null,
          bonusId: orderOffer?.bonusId ?? null,
          bonusCode: orderOffer?.bonusCode ?? null,
        });
        settled.deliveries.push(row);
      } catch (err) {
        console.error(`settleDelivery: écriture comptable échouée pour ${order.id} —`, err.message);
      }
    }

    return settled;
  } catch (error) {
    console.error('settleDelivery: règlement échoué (commandes conservées) —', error.message);
    return settled;
  }
};
