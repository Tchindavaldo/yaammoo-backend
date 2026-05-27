// ============================================================================
// getBonusService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getBonusService = async () => {
  try {
    const data = await repos.bonus.getAll();
    if (!data || data.length === 0) throw new Error('collection bonus non trouvé');
    return data;
  } catch (error) {
    console.error('Erreur dans getBonusService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des bonus');
  }
};
