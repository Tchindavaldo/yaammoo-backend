// ============================================================================
// getOrdersService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { enrichOrdersWithCourse } = require('./enrichOrdersWithCourse');

exports.getOrdersService = async fastFoodId => {
  try {
    const ff = await repos.fastfoods.getById(fastFoodId);
    if (!ff) throw new Error('Fastfood non trouvé');
    return await enrichOrdersWithCourse(await repos.orders.getByFastFood(fastFoodId));
  } catch (error) {
    console.error('Erreur dans getOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
