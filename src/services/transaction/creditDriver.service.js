// ============================================================================
// creditDriver.service — Paie la course du livreur PLATEFORME
// ============================================================================
// En régime `deliveryBy = 'platform'`, la course n'est pas versée au fastfood :
// c'est la plateforme qui livre, avec ses propres livreurs. Le montant dû est
// `order_settlements.driver_amount` — le résidu de la cascade, après que la
// course a absorbé l'arrondi du prix vers le bas.
//
// L'argent sort donc du portefeuille PLATEFORME : la commande a été encaissée
// en entier par la plateforme, qui reverse au fastfood ses articles et au
// livreur sa course. On trace le versement comme une transaction
// `driver_credit` sur l'uid du livreur — même mécanique que `merchant_credit`,
// donc même portefeuille dérivé, même historique, même socket.
//
// ⚠️ Une seule course par DÉPART : seule la commande qui porte la course a un
// `driver_amount` non nul (cf. `settleDelivery`). Les autres lignes du panier
// valent 0 et ne produisent aucun versement — sans quoi le livreur serait payé
// N fois pour un seul déplacement.
//
// ⚠️ Rien n'est versé tant que la commande n'est pas LIVRÉE : une course
// annulée en chemin ne se paie pas. L'appel se fait donc à la transition
// `delivered`, pas au paiement.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

/**
 * Verse sa course au livreur d'une commande livrée par la plateforme.
 *
 * Idempotent : un rejeu ne double pas le versement (recherche préalable d'une
 * transaction `driver_credit` déjà posée sur cette commande).
 *
 * Non bloquant pour l'appelant : la commande est déjà livrée quand on arrive
 * ici. Un incident comptable est journalisé, jamais propagé.
 *
 * @param {object} params
 * @param {object} params.order commande livrée (id, driverId, fastFoodId)
 * @returns {Promise<object|null>} la transaction créée, ou null si rien à verser
 */
exports.creditDriverForOrder = async ({ order }) => {
  const logPrefix = `[creditDriver] orderId=${order?.id}`;

  const driverId = order?.driverId;
  if (!driverId) return null; // livré par le fastfood lui-même : rien à verser

  let settlement = null;
  try {
    settlement = await repos.orderSettlements.getByOrder(order?.id);
  } catch (e) {
    console.error(`${logPrefix} règlement non lu — course non versée :`, e.message);
    return null;
  }

  const amount = Math.max(0, Number(settlement?.driverAmount) || 0);
  // 0 = cette commande ne porte pas la course (partagée avec une autre du
  // panier), ou la boutique est livrée par le fastfood.
  if (amount <= 0) return null;

  // Idempotence : le versement ne doit pas se rejouer si la transition
  // `delivered` est émise deux fois.
  try {
    const existing = await repos.transactions.findDriverCredit(order.id);
    if (existing) {
      console.warn(`${logPrefix} course déjà versée (tx=${existing.id}) → skip`);
      return existing;
    }
  } catch (e) {
    console.warn(`${logPrefix} contrôle d'idempotence impossible (${e.message}) → versement tenté`);
  }

  const tx = await repos.transactions.create({
    type: 'driver_credit',
    userId: driverId,
    amount,
    name: 'Course livrée',
    payBy: 'platform',
    fastFoodId: order?.fastFoodId || null,
    relatedOrderId: order?.id || null,
    grossAmount: amount,
  });

  await reliableEmit(getIO(), driverId, 'wallet.credited', {
    transactionId: tx.id,
    type: 'driver_credit',
    direction: 'payin',
    amount,
    grossAmount: amount,
    name: tx.name,
    fastFoodId: tx.fastFoodId ?? null,
    relatedOrderId: tx.relatedOrderId ?? null,
    createdAt: tx.createdAt,
  }).catch(e => console.warn(`${logPrefix} socket wallet.credited:`, e.message));

  return tx;
};
