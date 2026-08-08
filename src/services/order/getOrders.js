// ============================================================================
// getOrdersService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { enrichOrdersWithCourse } = require('./enrichOrdersWithCourse');
const { toMerchantView } = require('./toMerchantView');

exports.getOrdersService = async fastFoodId => {
  try {
    const ff = await repos.fastfoods.getById(fastFoodId);
    if (!ff) throw new Error('Fastfood non trouvé');
    // Vue MARCHAND : prix réels et montant encaissé, pas le prix client.
    return await toMerchantView(await enrichOrdersWithCourse(await repos.orders.getByFastFood(fastFoodId)));
  } catch (error) {
    console.error('Erreur dans getOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
