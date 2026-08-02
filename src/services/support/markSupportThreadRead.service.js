// ============================================================================
// markSupportThreadReadService — remet le compteur de non-lus a zero
// ============================================================================
const repos = require('../../repositories');

exports.markSupportThreadReadService = async threadId => {
  try {
    if (!threadId) return { success: false, message: 'threadId requis' };
    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { success: false, message: 'Discussion introuvable', notFound: true };

    const updated = await repos.supportThreads.updateThread(threadId, { unreadCount: 0 });
    return { success: true, data: updated };
  } catch (error) {
    console.error('Erreur dans markSupportThreadReadService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
