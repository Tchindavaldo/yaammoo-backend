// ============================================================================
// creditMerchant.service — Crédite le portefeuille marchand à la commande payée
// ============================================================================
// Appelé pour CHAQUE item d'un paiement réussi (verdict MobileWallet successful).
// Le portefeuille marchand est calculé depuis les transactions : on enregistre
// donc une transaction `type='merchant_credit'` sur le userId du marchand.
//
// AUCUNE retenue n'est appliquée ici. La commission MobileWallet est prélevée
// UNE SEULE FOIS, en amont, sur le montant encaissé (`payment_fee_percent` des
// settings, extrait du TTC par `feeIncludedIn`). Le bénéfice yaammoo, lui, est
// déjà porté par la marge plateforme et l'écart de zone — pas par un frais
// supplémentaire sur le marchand.
//
// Le verdict global est protégé par reserveSettlement (un seul canal traite) :
// le crédit n'est créé qu'une seule fois. Échec partiel toléré (logué), comme
// la création/transition de commande.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { reliableEmit } = require('../../utils/reliableEmit');

/**
 * Crée la transaction de crédit marchand pour un item de commande payé.
 * @param {object} params
 * @param {object} params.item  commande complète (fastFoodId, total, id?, menu?)
 * @param {string} params.clientUserId  user qui a payé (pour traçabilité/log)
 */
exports.creditMerchantForItem = async ({ item, clientUserId }) => {
  const logPrefix = `[creditMerchant] fastFoodId=${item?.fastFoodId}`;

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

  const menuName = item?.menu?.name || item?.menu?.titre || 'Commande';

  const tx = await repos.transactions.create({
    type: 'merchant_credit',
    userId: merchantUserId,
    amount: gross,
    name: `Gain ${menuName}`,
    payBy: 'order',
    fastFoodId,
    relatedOrderId: item?.id || null,
    grossAmount: gross,
    clientUserId: clientUserId || null,
  });

  // Notifier le marchand (émission FIABLE : rejouée si le marchand est hors ligne).
  try {
    await reliableEmit(getIO(), merchantUserId, 'wallet.credited', {
      transactionId: tx.id,
      type: 'merchant_credit',
      direction: 'payin',
      amount: gross,
      grossAmount: gross,
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
