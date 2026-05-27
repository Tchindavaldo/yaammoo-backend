// ============================================================================
// getBonusRequestService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.getBonusRequestService = async (data, id) => {
  try {
    if (data === undefined && id) {
      const found = await repos.bonusRequests.getById(id);
      if (!found) return { found: false };
      return { found: true, data: found };
    }

    if (id === undefined && data) {
      const { bonusId, userId, bonusType } = data;
      const found = await repos.bonusRequests.findByUserBonus({ bonusId, userId, bonusType });
      if (!found) return { found: false };
      return { found: true, data: found };
    }

    return { found: false, error: 'Aucun paramètre valide fourni.' };
  } catch (error) {
    console.error('Erreur dans getBonusRequestService:', error);
    return { found: false, error: error.message };
  }
};
