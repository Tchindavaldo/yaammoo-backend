// ============================================================================
// notifySupportMessage — push notification a l'autre partie du fil
// ============================================================================
// Message du CLIENT  -> notifie le proprietaire de la boutique concernee.
//                       Fil sans boutique (plateforme yaammoo) : personne a
//                       notifier cote app, le back-office traite ces fils.
// Message du SUPPORT -> notifie le client proprietaire du fil.
// ============================================================================
const repos = require('../../repositories');
const { notifyOrderEvent } = require('../notification/helpers/notifyOrderEvent');

/** Apercu court du message dans le corps de la notification. */
const preview = text => {
  const line = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
};

/** Proprietaire de la boutique, seul destinataire cote marchand. */
const getFastFoodOwnerId = async fastFoodId => {
  try {
    const ff = await repos.fastfoods.getById(fastFoodId);
    return ff ? ff.userId || null : null;
  } catch (e) {
    console.warn('[notifySupportMessage] getFastFoodOwnerId error:', e.message);
    return null;
  }
};

/**
 * Envoie la push correspondant a un nouveau message.
 * Ne fait jamais echouer l'appelant : toute erreur est logguee.
 */
exports.notifySupportMessage = async ({ thread, message }) => {
  try {
    const fromSupport = message.author === 'support';

    const targetUserId = fromSupport ? thread.userId : thread.fastFood ? await getFastFoodOwnerId(thread.fastFood.id) : null;
    if (!targetUserId) return;

    const title = fromSupport ? 'Support yaammoo' : 'Nouveau message client';
    await notifyOrderEvent({
      targetUserId,
      type: 'Support',
      title,
      body: preview(message.text),
      route: `support/${thread.id}`,
    });
  } catch (e) {
    console.error('[notifySupportMessage] error:', e.message);
  }
};
