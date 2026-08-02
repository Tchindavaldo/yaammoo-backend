// ============================================================================
// getSupportMessagesService — messages d'un fil, ordre chronologique
// ============================================================================
const repos = require('../../repositories');

exports.getSupportMessagesService = async threadId => {
  try {
    if (!threadId) return { success: false, message: 'threadId requis' };
    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { success: false, message: 'Discussion introuvable', notFound: true };

    const messages = await repos.supportThreads.getMessagesByThread(threadId);
    return { success: true, data: messages };
  } catch (error) {
    console.error('Erreur dans getSupportMessagesService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
