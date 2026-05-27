// ============================================================================
// getFastFoodService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getFastFoodService = async (fastFoodId) => {
  try {
    const fastfood = await repos.fastfoods.getById(fastFoodId);
    if (!fastfood) throw new Error('Fastfood non trouvé');
    return fastfood;
  } catch (error) {
    throw new Error(error.message || 'Erreur lors de la récupération du fastfood');
  }
};
