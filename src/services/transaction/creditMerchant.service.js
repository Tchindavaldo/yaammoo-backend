// ============================================================================
// creditMerchant.service — Crédite le portefeuille marchand à la commande payée
// ============================================================================
// Appelé pour CHAQUE item d'un paiement réussi (verdict MobileWallet successful).
// Le portefeuille marchand est calculé depuis les transactions : on enregistre
// donc une transaction `type='merchant_credit'` sur le userId du marchand.
//
// AUCUNE retenue n'est appliquée ici. Les frais de paiement sont prélevés UNE
// SEULE FOIS, en amont, sur le montant encaissé (barème de l'agrégateur,
// `pricing/paymentFees.js`, extrait au règlement). Le bénéfice yaammoo, lui, est
// déjà porté par la marge plateforme et l'écart de zone — pas par un frais
// supplémentaire sur le marchand.
//
// Chaque crédit enregistre l'AGRÉGATEUR et le RÉSEAU du paiement (migration
// 064) : le portefeuille est scindé en deux soldes MTN / Orange, et seuls les
// agrégateurs du portefeuille (pawaPay) sont affichés et retirables. Un crédit
// sans paiement réel (build de test, Apple Review) est tracé sans agrégateur :
// il reste hors portefeuille.
//
// Le verdict global est protégé par reserveSettlement (un seul canal traite) :
// le crédit n'est créé qu'une seule fois. Échec partiel toléré (logué), comme
// la création/transition de commande.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');
const { countsInWallet } = require('../../utils/paymentAggregator');
const { toCanonicalNetwork } = require('../../utils/mobileNetwork');
const { isPlatformDelivered } = require('../pricing/deliveryPricing');

/**
 * Crée la transaction de crédit marchand pour un item de commande payé.
 * @param {object} params
 * @param {object} params.item  commande complète (fastFoodId, total, id?, menu?)
 * @param {string} params.clientUserId  user qui a payé (pour traçabilité/log)
 * @param {string|null} [params.orderId] id de la commande en base. Panier :
 *   `item.id`. Achat direct : id de la commande CRÉÉE au verdict (l'item n'en
 *   a pas) — sans lui, son règlement est introuvable.
 * @param {object|null} [params.payment] `{ aggregator, network, mwTransactionId }`
 *   du paiement MobileWallet. null = aucun argent encaissé (hors portefeuille).
 */
exports.creditMerchantForItem = async ({ item, clientUserId, payment = null, orderId = null }) => {
  const resolvedOrderId = item?.id || orderId || null;
  const logPrefix = `[creditMerchant] orderId=${resolvedOrderId || '∅'} fastFoodId=${item?.fastFoodId}`;

  const fastFoodId = item?.fastFoodId;
  const gross = Number(item?.total) || 0;
  if (!fastFoodId || gross <= 0) {
    console.warn(`${logPrefix} ⚠️ fastFoodId ou total manquant/invalide (gross=${gross}) → skip`);
    return null;
  }

  // Résoudre le marchand propriétaire de la boutique
  const fastfood = await repos.fastfoods.getById(fastFoodId);
  const merchantUserId = fastfood?.userId;
  if (!merchantUserId) {
    console.warn(`${logPrefix} ⚠️ Marchand (userId) introuvable pour ce fastfood → skip crédit`);
    return null;
  }

  // Ce qui revient au marchand, lu dans le règlement (`order_settlements`) :
  //   plat + extras + boissons (`items_real`)
  //   + frais de retrait (`withdrawal_fee`, sur la commande qui les porte)
  //   + course (`driver_amount`) SI c'est le marchand qui livre (régime
  //     fastfood). En régime plateforme, la course va au livreur plateforme
  //     (`creditDriver`), pas au marchand.
  // Jamais `item.total` quand le règlement existe : il porte la marge et les
  // frais de paiement, qui ne lui appartiennent pas.
  let credited = gross;
  try {
    const settlement = resolvedOrderId ? await repos.orderSettlements.getByOrder(resolvedOrderId) : null;
    if (settlement) {
      const course = isPlatformDelivered(fastfood) ? 0 : Number(settlement.driverAmount) || 0;
      credited = Math.max(0, (Number(settlement.itemsReal) || 0) + (Number(settlement.withdrawalFee) || 0) + course);
      console.info(`${logPrefix} règlement → crédit=${credited} (plats=${settlement.itemsReal}, retrait=${settlement.withdrawalFee}, course=${course}, total client=${gross})`);
    } else {
      console.error(`${logPrefix} ❌ règlement absent → crédit sur le total client (${gross}) — à corriger à la main`);
    }
  } catch (e) {
    console.error(`${logPrefix} ❌ règlement non lu (${e.message}) → crédit sur le total client`);
  }

  const menuName = item?.menu?.name || item?.menu?.titre || 'Commande';
  const aggregator = payment?.aggregator || null;
  const network = toCanonicalNetwork(payment?.network);
  if (aggregator && !network) {
    console.error(`${logPrefix} ⚠️ réseau du paiement illisible ("${payment?.network}") → crédit hors solde MTN/Orange`);
  }

  const tx = await repos.transactions.create({
    type: 'merchant_credit',
    userId: merchantUserId,
    amount: credited,
    name: `Gain ${menuName}`,
    payBy: 'order',
    aggregator,
    network,
    mwTransactionId: payment?.mwTransactionId || null,
    fastFoodId,
    relatedOrderId: resolvedOrderId,
    grossAmount: gross,
    clientUserId: clientUserId || null,
  });

  // Hors portefeuille (DigiKUNTZ, test) : rien à annoncer au marchand, son
  // solde affiché ne bouge pas.
  if (!countsInWallet(aggregator) || !network) return tx;

  // Notifier le marchand (émission FIABLE : rejouée si le marchand est hors ligne).
  try {
    await reliableEmit(getIO(), merchantUserId, 'wallet.credited', {
      transactionId: tx.id,
      type: 'merchant_credit',
      direction: 'payin',
      amount: credited,
      grossAmount: gross,
      // Solde crédité : 'MTN' | 'ORANGEMONEY' (clés `mtn` / `orange` de /wallet/balance).
      network,
      name: tx.name,
      fastFoodId,
      relatedOrderId: resolvedOrderId,
      createdAt: tx.createdAt, // date de la transaction (pour liste + groupement par jour)
    });
  } catch (e) {
    console.warn(`${logPrefix} émission socket wallet.credited non critique: ${e.message}`);
  }

  return tx;
};
