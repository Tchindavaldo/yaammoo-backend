// ============================================================================
// postBonusService — Façade vers l'orchestrateur
// ============================================================================
const repos = require('../../repositories');

exports.postBonusService = async (data) => {
  return repos.bonus.create(data);
};
