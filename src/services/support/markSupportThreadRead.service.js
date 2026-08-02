// ============================================================================
// markSupportThreadReadService — remet le compteur de non-lus a zero
// ============================================================================
const repos = require('../../repositories');

/**
 * @param side 'user' (defaut) remet a zero les non-lus du client ;
 *             'support' ceux de la boutique / du back-office.
 */
exports.markSupportThreadReadService = async (threadId, side = 'user') => {
  try {
    if (!threadId) return { success: false, message: 'threadId requis' };
    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { success: false, message: 'Discussion introuvable', notFound: true };

    const patch = side === 'support' ? { supportUnreadCount: 0 } : { unreadCount: 0 };
    const updated = await repos.supportThreads.updateThread(threadId, patch);
    return { success: true, data: updated };
  } catch (error) {
    console.error('Erreur dans markSupportThreadReadService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
