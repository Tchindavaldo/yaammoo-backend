// ============================================================================
// notificationSound — son personnalise d'une push, choisi par son `type`
// ============================================================================
// Chaque son = un fichier embarque dans l'app (`yaammoo_<key>.wav`) et, sur
// Android, un canal dedie `yaammoo_<key>` cree par l'app (le son d'un canal
// Android ne change plus apres sa creation : nouveau son = nouveau canal).
// Doc : architecture/notifications.md (« Sons »).
// ============================================================================

const SOUND_BY_TYPE = {
  order_new: 'order',
  order_status: 'order',
  order_delivering: 'order',
  driver_application: 'order',
  order_cancel_by_user: 'alert',
  order_cancel_by_merchant: 'alert',
  pricing_alert: 'alert',
  driver_removed: 'alert',
  Support: 'message',
};

/** Son par defaut : paiement reussi, bonus, annonces, rang. */
const DEFAULT_SOUND = 'success';

/**
 * @returns {{ channelId: string, androidSound: string, iosSound: string }}
 */
const soundFor = type => {
  const key = SOUND_BY_TYPE[type] || DEFAULT_SOUND;
  const name = `yaammoo_${key}`;
  return { channelId: name, androidSound: name, iosSound: `${name}.wav` };
};

module.exports = { soundFor };
