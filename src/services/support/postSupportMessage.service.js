// ============================================================================
// postSupportMessageService — ajoute un message dans un fil existant
// ============================================================================
const repos = require('../../repositories');
const { validateSupportMessage } = require('../../utils/validator/validateSupport');
const { emitSupportMessage } = require('./emitSupportMessage');
const { notifySupportMessage } = require('./notifySupportMessage');

exports.postSupportMessageService = async (threadId, data) => {
  try {
    if (!threadId) return { success: false, message: 'threadId requis' };

    const errors = validateSupportMessage(data);
    if (errors.length > 0) return { success: false, message: errors };

    const thread = await repos.supportThreads.getThreadById(threadId);
    if (!thread) return { success: false, message: 'Discussion introuvable', notFound: true };

    const author = data.author || 'user';
    const message = await repos.supportThreads.createMessage({ threadId, author, text: data.text });

    // Chaque partie a son compteur : un message incremente celui d'en face et
    // remet a zero celui de son auteur (il vient de lire le fil).
    const fromSupport = author === 'support';
    const updated = await repos.supportThreads.updateThread(threadId, {
      lastMessage: data.text,
      unreadCount: fromSupport ? (thread.unreadCount || 0) + 1 : 0,
      supportUnreadCount: fromSupport ? 0 : (thread.supportUnreadCount || 0) + 1,
    });

    emitSupportMessage({ userId: thread.userId, thread: updated, message });
    await notifySupportMessage({ thread: updated, message });

    return { success: true, data: { thread: updated, message } };
  } catch (error) {
    console.error('Erreur dans postSupportMessageService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
