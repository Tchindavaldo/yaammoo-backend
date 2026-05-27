// ============================================================================
// getBonusRequestsService — Façade vers l'orchestrateur
// ============================================================================
// Note : conserve le bug original (utilise 'bonus' au lieu de 'bonusRequest').
// Si tu veux la liste réelle des demandes de bonus, change repos.bonus → repos.bonusRequests.
const repos = require('../../repositories');

exports.getBonusRequestsService = async () => {
  try {
    const data = await repos.bonus.getAll();
    if (!data || data.length === 0) throw new Error('collection bonus non trouvé');
    return data;
  } catch (error) {
    console.error('Erreur dans getBonusService:', error);
    throw new Error(error.message || 'Erreur lors de la récupération des bonus');
  }
};
