// ============================================================================
// emitSupportMessage — diffusion temps reel d'un message support
// ============================================================================
// Rooms (cf. R8) :
//   `<userId>`     : le client proprietaire du fil
//   `<fastFoodId>` : la boutique concernee, quand le fil en vise une
// Un fil sans boutique vise la plateforme yaammoo : seul le client est servi
// en socket (le back-office lit les fils par HTTP).
const { getIO } = require('../../socket');

/**
 * Emet `support.message` aux deux parties du fil.
 * L'echec d'emission ne doit jamais faire echouer l'ecriture en base.
 */
exports.emitSupportMessage = ({ userId, thread, message }) => {
  try {
    const io = getIO();
    if (!io) return;

    const payload = { threadId: thread.id, thread, message };
    const target = userId || thread.userId;
    if (target) io.to(target).emit('support.message', payload);
    if (thread.fastFood && thread.fastFood.id) {
      io.to(thread.fastFood.id).emit('support.message', payload);
    }
  } catch (error) {
    console.error('Erreur emitSupportMessage:', error.message);
  }
};
