// ============================================================================
// getOrdersService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');
const { enrichOrdersWithCourse } = require('./enrichOrdersWithCourse');
const { toMerchantView } = require('./toMerchantView');

// Statuts visibles par le marchand : ni le panier non validé (`pendingToBuy`),
// ni les commandes annulées.
const MERCHANT_VISIBLE_STATUS = ['pending', 'processing', 'finished', 'delivering', 'delivered'];

exports.getOrdersService = async fastFoodId => {
  try {
    const ff = await repos.fastfoods.getById(fastFoodId);
    if (!ff) throw new Error('Fastfood non trouvé');
    const orders = await repos.orders.query({ fastFoodId, status: MERCHANT_VISIBLE_STATUS });
    // Vue MARCHAND : prix réels et montant encaissé, pas le prix client.
    return await toMerchantView(await enrichOrdersWithCourse(orders));
  } catch (error) {
    console.error('Erreur dans getOrdersService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des commandes');
  }
};
