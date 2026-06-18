// ============================================================================
// creditMerchant.service — Crédite le portefeuille marchand à la commande payée
// ============================================================================
// Appelé pour CHAQUE item d'un paiement réussi (verdict MobileWallet successful).
// Le portefeuille marchand est calculé depuis les transactions : on enregistre
// donc une transaction `type='merchant_credit'` sur le userId du marchand, du
// montant NET (total - commission MobileWallet - frais fixe yaammoo).
//
// Le verdict global est protégé par reserveSettlement (un seul canal traite) :
// le crédit n'est créé qu'une seule fois. Échec partiel toléré (logué), comme
// la création/transition de commande.
// ============================================================================

const repos = require('../../repositories');
const { getIO } = require('../../socket');
const { computeNet } = require('../../utils/commission');

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

  const { net, mwCommission, yaammooFee } = computeNet(gross);
  const menuName = item?.menu?.name || item?.menu?.titre || 'Commande';

  const tx = await repos.transactions.create({
    type: 'merchant_credit',
    userId: merchantUserId,
    amount: net,
    name: `Gain ${menuName}`,
    payBy: 'order',
    fastFoodId,
    relatedOrderId: item?.id || null,
    grossAmount: gross,
    mwCommission,
    yaammooFee,
    clientUserId: clientUserId || null,
  });

  console.info(`${logPrefix} ✓ Crédit marchand ${merchantUserId} : +${net} FCFA (brut=${gross}, mw=${mwCommission}, yaammoo=${yaammooFee})`);

  // Notifier le marchand en temps réel (room = userId, cf. socket.js join_user)
  try {
    getIO()
      .to(merchantUserId)
      .emit('wallet.credited', {
        amount: net,
        grossAmount: gross,
        fastFoodId,
        relatedOrderId: item?.id || null,
        transactionId: tx.id,
      });
  } catch (e) {
    console.warn(`${logPrefix} émission socket wallet.credited non critique: ${e.message}`);
  }

  return tx;
};
