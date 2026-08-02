// ============================================================================
// postSupportThreadService — cree un fil support avec son premier message
// ============================================================================
// `fastFoodId` absent/null : la demande est adressee a la plateforme yaammoo.
const repos = require('../../repositories');
const { validateSupportThread } = require('../../utils/validator/validateSupport');
const { emitSupportMessage } = require('./emitSupportMessage');

/** Resume du fil : premiere ligne du message, tronquee. */
const buildTitle = text => {
  const line = String(text).trim().split('\n')[0];
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
};

exports.postSupportThreadService = async data => {
  try {
    const errors = validateSupportThread(data);
    if (errors.length > 0) return { success: false, message: errors };

    const thread = await repos.supportThreads.createThread({
      userId: data.userId,
      fastFoodId: data.fastFoodId || null,
      topic: data.topic,
      title: data.title || buildTitle(data.text),
      status: 'open',
      unreadCount: 0,
      lastMessage: data.text,
    });

    const message = await repos.supportThreads.createMessage({
      threadId: thread.id,
      author: 'user',
      text: data.text,
    });

    emitSupportMessage({ userId: data.userId, thread, message });

    return { success: true, data: { thread, message } };
  } catch (error) {
    console.error('Erreur dans postSupportThreadService:', error);
    return { success: false, message: error.message || String(error) };
  }
};
