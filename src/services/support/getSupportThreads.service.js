// ============================================================================
// getSupportThreadsService — liste des fils d'un utilisateur (sans messages)
// ============================================================================
const repos = require('../../repositories');

exports.getSupportThreadsService = async userId => {
  try {
    if (!userId) return { success: false, message: 'userId requis' };
    const threads = await repos.supportThreads.getThreadsByUser(userId);
    return { success: true, data: threads };
  } catch (error) {
    console.error('Erreur dans getSupportThreadsService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
