// services/notification/APNS/sendApnsPush.service.js
// Envoie de notifications push directement à Apple APNs via HTTP/2
// en utilisant la clé .p8 (variables d'environnement APNS_*).

const apn = require('@parse/node-apn');
const path = require('path');

let provider = null;

const getProvider = () => {
  if (provider) return provider;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const production = process.env.APNS_PRODUCTION === 'true';

  if (!keyId || !teamId) {
    throw new Error('[APNS] APNS_KEY_ID et APNS_TEAM_ID sont requis dans .env');
  }

  // Priorité: APNS_KEY_CONTENT (Fly.io / prod) puis APNS_KEY_PATH (local dev)
  let key;
  if (process.env.APNS_KEY_CONTENT) {
    key = process.env.APNS_KEY_CONTENT.replace(/\\n/g, '\n');
  } else if (process.env.APNS_KEY_PATH) {
    const keyPath = process.env.APNS_KEY_PATH;
    key = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  } else {
    throw new Error('[APNS] Définis APNS_KEY_CONTENT (prod) OU APNS_KEY_PATH (local)');
  }

  provider = new apn.Provider({
    token: { key, keyId, teamId },
    production,
  });

  console.log(`✅ [APNS] Provider initialisé (production=${production}, keyId=${keyId})`);
  return provider;
};

const sendApnsPush = async ({ tokens, title, body, data = {} }) => {
  const targets = (tokens || []).filter((t) => t && typeof t === 'string');
  if (targets.length === 0) {
    return { success: false, message: 'No APNs tokens' };
  }

  const bundleId = process.env.APNS_BUNDLE_ID || 'com.yaammoo.app';

  const notification = new apn.Notification();
  notification.alert = { title, body };
  notification.sound = 'default';
  notification.topic = bundleId;
  notification.payload = data;
  notification.contentAvailable = true;

  try {
    const apnProvider = getProvider();
    console.log(`📤 [APNS] Envoi vers ${targets.length} token(s) iOS`);

    const response = await apnProvider.send(notification, targets);

    const failedTokens = [];
    response.failed.forEach((fail) => {
      const reason = fail.response?.reason || fail.error?.message || 'unknown';
      console.error(`❌ [APNS] Échec ${fail.device.substring(0, 16)}... :`, reason);
      if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') {
        failedTokens.push(fail.device);
      }
    });

    console.log(`✅ [APNS] Résultat : ${response.sent.length} succès, ${response.failed.length} échecs`);

    return {
      success: true,
      sent: response.sent.length,
      failed: response.failed.length,
      tokensToDelete: failedTokens,
    };
  } catch (err) {
    console.error('❌ [APNS] Erreur critique:', err.message);
    return { success: false, error: err.message, tokensToDelete: [] };
  }
};

module.exports = sendApnsPush;
