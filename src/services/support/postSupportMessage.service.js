// ============================================================================
// postSupportMessageService — ajoute un message dans un fil existant
// ============================================================================
const repos = require('../../repositories');
const { validateSupportMessage } = require('../../utils/validator/validateSupport');
const { emitSupportMessage } = require('./emitSupportMessage');

exports.postSupportMessageService = async (threadId, data) => {
  try {
    if (!threadId) return { success: false, message: 'threadId requis' };

    const errors = validateSupportMessage(data);
    if (errors.length > 0) return { success: false, message: errors };

    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { success: false, message: 'Discussion introuvable', notFound: true };

    const author = data.author || 'user';
    const message = await repos.supportThreads.createMessage({ threadId, author, text: data.text });

    // Un message du support incremente les non-lus du client ; les siens non.
    const updated = await repos.supportThreads.updateThread(threadId, {
      lastMessage: data.text,
      unreadCount: author === 'support' ? (thread.unreadCount || 0) + 1 : 0,
    });

    emitSupportMessage({ userId: thread.userId, thread: updated, message });

    return { success: true, data: { thread: updated, message } };
  } catch (error) {
    console.error('Erreur dans postSupportMessageService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
