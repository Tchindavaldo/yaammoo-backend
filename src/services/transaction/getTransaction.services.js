// ============================================================================
// getTransactionService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getTransactionService = async (userId) => {
  try {
    if (!userId) return { success: false, message: 'userId est requis' };
    const data = await repos.transactions.getByUser(userId);
    if (!data || data.length === 0) {
      return { success: true, data: [], message: "La collection transaction n'existe pas" };
    }
    return { success: true, data, message: 'transactions récupérées avec succès' };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la récupération des transactions' };
  }
};

exports.getTransactionByIdService = async (transactionId) => {
  try {
    if (!transactionId) throw new Error('transactionId est requis');
    const data = await repos.transactions.getById(transactionId);
    if (!data) return { success: true, data: null, message: "Transaction non trouvée" };
    return { success: true, data, message: 'transaction récupérée avec succès' };
  } catch (error) {
    return { success: false, message: error.message || 'Erreur lors de la récupération de la transaction' };
  }
};
