// ============================================================================
// getSupportThreadsService — liste des fils d'un utilisateur (sans messages)
// ============================================================================
const repos = require('../../repositories');

/**
 * Liste les fils selon le demandeur :
 *   `userId`     : fils du client
 *   `fastFoodId` : fils recus par une boutique
 *   `scope=platform` : fils adresses a la plateforme yaammoo (back-office)
 */
exports.getSupportThreadsService = async ({ userId, fastFoodId, scope } = {}) => {
  try {
    if (scope === 'platform') {
      const threads = await repos.supportThreads.getPlatformThreads();
      return { success: true, data: threads };
    }
    if (fastFoodId) {
      const threads = await repos.supportThreads.getThreadsByFastFood(fastFoodId);
      return { success: true, data: threads };
    }
    if (!userId) return { success: false, message: 'userId, fastFoodId ou scope=platform requis' };

    const threads = await repos.supportThreads.getThreadsByUser(userId);
    return { success: true, data: threads };
  } catch (error) {
    console.error('Erreur dans getSupportThreadsService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
