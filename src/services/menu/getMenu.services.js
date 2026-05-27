// ============================================================================
// getMenuService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getMenuService = async (fastFoodId) => {
  try {
    if (!fastFoodId) throw new Error('fastFoodId est requis');
    return await repos.menus.getByFastFood(fastFoodId);
  } catch (error) {
    throw new Error(error.message || 'Erreur lors de la récupération des menu');
  }
};
