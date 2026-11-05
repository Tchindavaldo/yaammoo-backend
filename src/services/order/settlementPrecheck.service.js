// ============================================================================
// settlementPrecheck — Simuler le règlement AVANT d'encaisser
// ============================================================================
// Appelé par postTransaction juste avant la demande USSD. Le règlement réel
// (settleDelivery) n'a lieu qu'APRÈS le paiement : s'il échoue à ce moment-là,
// l'argent est déjà pris. On rejoue donc le même calcul, sans écriture, et on
// REFUSE le paiement si :
//   1. le prix de livraison payé ne correspond pas au tarif de la zone dans le
//      créneau choisi (régime fastfood : la course est facturée à part) ;
//   2. le calcul échoue ;
//   3. une marge plateforme sort négative (la base la refuserait).
// ============================================================================
const repos = require('../../repositories');
const { settleDeliveryService } = require('./settleDelivery.service');
const { resolveOfferedDeliveries } = require('../../utils/validator/validatePaymentAmount');
const { toNumber, isPlatformDelivered, deliverySource, zoneDeliveryPrice } = require('../pricing/deliveryPricing');

const REFUSAL = 'Paiement refusé : le montant de cette commande ne peut pas être réparti correctement. Réessaie ou contacte le support.';

/**
 * @returns {Promise<null | { code:string, message:string, detail:string }>} null = OK
 */
exports.precheckSettlement = async ({ orders, userId, bonusCode, payment }) => {
  const list = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
  if (list.length === 0) return null;

  // 1. Course payée = tarif du créneau choisi (régime fastfood, non offerte).
  const { offered } = await resolveOfferedDeliveries(list, { userId, bonusCode });
  const shops = new Map();
  for (const [i, o] of list.entries()) {
    if (o?.delivery?.status !== true || offered.has(i) || !o.fastFoodId) continue;
    if (!shops.has(o.fastFoodId)) shops.set(o.fastFoodId, await repos.fastfoods.getById(o.fastFoodId));
    const shop = shops.get(o.fastFoodId);
    if (!shop || isPlatformDelivered(shop)) continue;
    const due = zoneDeliveryPrice(deliverySource(shop), o.delivery.zone, o.delivery.type, o.delivery.time ?? null);
    const paid = toNumber(o.delivery.prix);
    if (paid !== due) {
      return { code: 'delivery_price_mismatch', message: REFUSAL, detail: `commande #${i + 1} zone=${o.delivery.zone} créneau=${o.delivery.time ?? '∅'} : livraison payée ${paid} ≠ tarif ${due}` };
    }
  }

  // 2-3. Règlement simulé.
  const settled = await settleDeliveryService({ orders: list.map(o => ({ ...o, userId: o.userId || userId })), bonusCode, payment, dryRun: true });
  if (settled.error) return { code: 'settlement_failed', message: REFUSAL, detail: settled.error };
  if (settled.settlements.length !== list.length) return { code: 'settlement_failed', message: REFUSAL, detail: `${settled.settlements.length}/${list.length} règlement(s) calculé(s)` };
  const negative = settled.settlements.find(s => toNumber(s.platformMargin) < 0);
  if (negative) {
    return { code: 'negative_margin', message: REFUSAL, detail: `marge ${negative.platformMargin} (plats=${negative.itemsReal}, course=${negative.driverAmount}, frais paiement=${negative.paymentFee}, retrait=${negative.withdrawalFee}, payé=${negative.itemsCharged})` };
  }
  return null;
};
