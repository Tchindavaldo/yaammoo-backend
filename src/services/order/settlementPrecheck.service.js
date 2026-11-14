// ============================================================================
// settlementPrecheck — Simuler le règlement AVANT d'encaisser
// ============================================================================
// Appelé par postTransaction juste avant la demande USSD. Le règlement réel
// (settleDelivery) n'a lieu qu'APRÈS le paiement : s'il échoue à ce moment-là,
// l'argent est déjà pris. On rejoue donc le même calcul, sans écriture, et on
// REFUSE le paiement si :
//   0. le régime de livraison vu par le client n'est plus le régime actuel ;
//   1. le prix de livraison payé ne correspond pas au tarif de la zone dans le
//      créneau choisi (régime fastfood : la course est facturée à part) ;
//   2. le calcul échoue ;
//   3. une marge plateforme sort négative (la base la refuserait).
// ============================================================================
const repos = require('../../repositories');
const { settleDeliveryService } = require('./settleDelivery.service');
const { resolveOfferedDeliveries } = require('../../utils/validator/validatePaymentAmount');
const { toNumber, isPlatformDelivered, deliverySource, zoneDeliveryPrice } = require('../pricing/deliveryPricing');
const { getPricingSettings } = require('../settings/settings.service');
const { suggestFixes, merchantMessage, notifyMerchant } = require('./precheckSuggestions.service');

// Course payée ≠ tarif actuel : la boutique a changé (zones, prix, créneau ou
// régime de livraison) pendant que le client avait la page ouverte. L'app
// recharge la boutique sur ce code (`delivery_price_mismatch`).
const PRICE_CHANGED = 'Les prix de livraison de cette boutique viennent de changer. Rafraîchis la page et refais ta commande.';
const REFUSAL = 'Paiement refusé : le montant de cette commande ne peut pas être réparti correctement. Réessaie ou contacte le support.';

/**
 * @returns {Promise<null | { code:string, message:string, detail:string }>} null = OK
 */
exports.precheckSettlement = async ({ orders, userId, bonusCode, payment }) => {
  const list = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
  if (list.length === 0) return null;

  const shops = new Map();
  const shopOf = async id => {
    if (!shops.has(id)) shops.set(id, await repos.fastfoods.getById(id));
    return shops.get(id);
  };

  // 0. Régime de livraison vu par le client (`order.deliveryBy`, posé par l'app
  // à la création de la commande) ≠ régime effectif ACTUEL : la boutique a
  // basculé (marchand <-> plateforme, interrupteur global) depuis. Les prix du
  // plat et de la course ne valent plus. Commande sans `deliveryBy` (ancienne
  // app) : contrôle sauté.
  for (const [i, o] of list.entries()) {
    if (!o?.deliveryBy || !o.fastFoodId) continue;
    const shop = await shopOf(o.fastFoodId);
    const current = shop ? (isPlatformDelivered(shop) ? 'platform' : 'fastfood') : null;
    if (current && o.deliveryBy !== current) {
      return { code: 'delivery_mode_changed', message: PRICE_CHANGED, detail: `commande #${i + 1} : régime vu ${o.deliveryBy}, régime actuel ${current}` };
    }
  }

  // 1. Course payée = tarif du créneau choisi (régime fastfood, non offerte).
  const { offered } = await resolveOfferedDeliveries(list, { userId, bonusCode });
  for (const [i, o] of list.entries()) {
    if (o?.delivery?.status !== true || offered.has(i) || !o.fastFoodId) continue;
    const shop = await shopOf(o.fastFoodId);
    if (!shop || isPlatformDelivered(shop)) continue;
    const due = zoneDeliveryPrice(deliverySource(shop), o.delivery.zone, o.delivery.type, o.delivery.time ?? null);
    const paid = toNumber(o.delivery.prix);
    if (paid !== due) {
      return { code: 'delivery_price_mismatch', message: PRICE_CHANGED, detail: `commande #${i + 1} zone=${o.delivery.zone} créneau=${o.delivery.time ?? '∅'} : livraison payée ${paid} ≠ tarif ${due}` };
    }
  }

  // 2-3. Règlement simulé.
  const withUser = list.map((o, i) => ({ ...o, id: o.id || `dry-${i}`, userId: o.userId || userId }));
  const settled = await settleDeliveryService({ orders: withUser, bonusCode, payment, dryRun: true });
  if (settled.error) return { code: 'settlement_failed', message: REFUSAL, detail: settled.error };
  if (settled.settlements.length !== list.length) return { code: 'settlement_failed', message: REFUSAL, detail: `${settled.settlements.length}/${list.length} règlement(s) calculé(s)` };
  const negative = settled.settlements.find(s => toNumber(s.platformMargin) < 0);
  if (negative) {
    const detail = `marge ${negative.platformMargin} (plats=${negative.itemsReal}, course=${negative.driverAmount}, frais paiement=${negative.paymentFee}, retrait=${negative.withdrawalFee}, payé=${negative.itemsCharged})`;
    // Valeurs qui feraient passer la commande, puis push au marchand.
    let suggestions = null;
    let merchantNotice = null;
    try {
      const index = withUser.findIndex(o => o.id === negative.orderId);
      const pricing = await getPricingSettings();
      suggestions = await suggestFixes({ list: withUser, index, offered, ctx: { bonusCode, payment, pricing } });
      merchantNotice = merchantMessage(withUser[index], suggestions);
      await notifyMerchant(withUser[index], suggestions, merchantNotice);
    } catch (e) {
      console.warn(`[settlementPrecheck] propositions marchand impossibles : ${e.message}`);
    }
    const { shop, ...values } = suggestions || {};
    return { code: 'negative_margin', message: REFUSAL, detail: `${detail}${merchantNotice ? ` | marchand : ${merchantNotice}` : ''}`, suggestions: suggestions ? values : null };
  }
  return null;
};
