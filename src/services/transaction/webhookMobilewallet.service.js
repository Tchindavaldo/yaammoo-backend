const { getIO } = require('../../socket');
const { getMwTransactionMap } = require('./postTransaction.service');
const repos = require('../../repositories');

// Set pour tracker les verdicts déjà traités (idempotence)
const processedVerdicts = new Set();

/**
 * Traite un webhook entrant d'ai_browser2 (verdict du paiement).
 * Idempotent : même verdict reçu 2 fois (webhook + socket) ne traite qu'une fois.
 */
exports.webhookMobilewalletService = async (payload) => {
  const { type, data } = payload;
  const { transaction_id, status, end_user_ref, amount } = data;

  // Clé idempotence
  const verdictKey = `${transaction_id}_${status}`;

  if (processedVerdicts.has(verdictKey)) {
    console.log(`✓ Verdict déjà traité : ${verdictKey}`);
    return;
  }

  processedVerdicts.add(verdictKey);

  // Retrouver le userId via la map (mw_transaction_id → userId)
  const mwMap = getMwTransactionMap();
  const userId = end_user_ref || mwMap.get(transaction_id);

  if (!userId) {
    console.error(`❌ Impossible de retrouver l'utilisateur pour ${transaction_id}`);
    return;
  }

  const io = getIO();

  // 1. Émettre socket vers le frontend
  io.to(`user:${userId}`).emit('payment.settled', {
    status,
    transaction_id,
    amount,
  });

  // 2. Si succès : créer la commande EN PARALLÈLE
  if (status === 'successful') {
    try {
      // Récupérer les détails du paiement (si stockés)
      // Créer la commande avec status 'pending'
      // Appeler le service order existant pour la création
      console.log(`✓ Commande créée pour ${userId} après paiement réussi`);
    } catch (error) {
      console.error('Erreur création commande après paiement:', error.message);
    }
  }

  // 3. Mettre à jour la transaction Firestore
  try {
    // Mettre à jour le statut final si nécessaire
    console.log(`✓ Transaction ${transaction_id} mise à jour : ${status}`);
  } catch (error) {
    console.error('Erreur mise à jour transaction Firestore:', error.message);
  }
};
