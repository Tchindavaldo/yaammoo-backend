// ============================================================================
// emitSupportMessage — diffusion temps reel d'un message support
// ============================================================================
// Room = `<userId>` (nommee par l'uid, SANS prefixe), cf. R8.
const { getIO } = require('../../socket');

/**
 * Emet `support.message` au proprietaire du fil.
 * L'echec d'emission ne doit jamais faire echouer l'ecriture en base.
 */
exports.emitSupportMessage = ({ userId, thread, message }) => {
  try {
    const io = getIO();
    if (!io || !userId) return;
    io.to(userId).emit('support.message', {
      threadId: thread.id,
      thread,
      message,
    });
  } catch (error) {
    console.error('Erreur emitSupportMessage:', error.message);
  }
};
