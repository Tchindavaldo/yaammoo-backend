// ============================================================================
// getUserOrdersService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getUserOrdersService = async (userId) => {
  try {
    const user = await repos.users.getUserByIdSafe(userId);
    if (!user) throw new Error('user non trouvé');
    return await repos.orders.getByUser(userId);
  } catch (error) {
    console.error('Erreur dans getUserOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
