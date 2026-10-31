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

/**
 * Crée la transaction de crédit marchand pour un item de commande payé.
 * @param {object} params
 * @param {object} params.item  commande complète (fastFoodId, total, id?, menu?)
 * @param {string} params.clientUserId  user qui a payé (pour traçabilité/log)
 * @param {object|null} [params.payment] `{ aggregator, network, mwTransactionId }`
 *   du paiement MobileWallet. null = aucun argent encaissé (hors portefeuille).
 * @param {string|null} [params.createdOrderId] id de la commande CRÉÉE pour un
 *   achat direct (l'item n'en a pas). Sert UNIQUEMENT à `relatedOrderId` (lien
 *   vers le réseau du paiement pour la course livreur) : il ne change PAS le
 *   montant crédité, qui reste calculé comme avant sur `item`.
 */
exports.creditMerchantForItem = async ({ item, clientUserId, payment = null, createdOrderId = null }) => {
  const logPrefix = `[creditMerchant] orderId=${item?.id || '∅'} fastFoodId=${item?.fastFoodId}`;

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

  // Ce qui revient VRAIMENT au marchand : le règlement fait foi. `item.total`
  // est le prix CLIENT — il porte la livraison, la marge et les frais, dont
  // rien ne lui appartient. Le créditer entier gonflerait son portefeuille
  // d'un argent qui doit partir ailleurs.
  let credited = gross;
  try {
    const settlement = await repos.orderSettlements.getByOrder(item?.id);
    if (settlement) {
      credited = Math.max(0, Number(settlement.itemsReal) || 0);
      console.info(`${logPrefix} règlement trouvé → crédit=${credited} (total client=${gross})`);
    } else {
      console.warn(`${logPrefix} ⚠️ règlement absent → crédit sur le total client (${gross}) — settleDelivery n'a PAS tourné pour cette commande (updateOrders échoué ou commande jamais passée en pending)`);
    }
  } catch (e) {
    console.warn(`${logPrefix} ⚠️ règlement non lu (${e.message}) → crédit sur le total client`);
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
    relatedOrderId: item?.id || createdOrderId || null,
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
      relatedOrderId: item?.id || null,
      createdAt: tx.createdAt, // date de la transaction (pour liste + groupement par jour)
    });
  } catch (e) {
    console.warn(`${logPrefix} émission socket wallet.credited non critique: ${e.message}`);
  }

  return tx;
};
