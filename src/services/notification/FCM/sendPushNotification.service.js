// services/sendPushNotification.js
// Orchestrateur push: route les tokens FCM (Android) via Firebase Admin
// et les tokens APNs (iOS) via node-apn direct.

const { admin } = require('../../../config/firebase');
const sendExpoPushNotification = require('./sendExpoPushNotification.service');
const sendApnsPush = require('../APNS/sendApnsPush.service');

/**
 * Signature acceptée :
 *   - { token, ... }                                → legacy: 1 token unique (FCM/Expo)
 *   - { tokens: ['fcm1', 'fcm2'], apnsTokens: ['ios1'], ... } → multi
 *
 * `imageUrl` (optionnel) : image de la notification. Android l'affiche seul
 * (FCM) ; iOS la reçoit via `mutable-content` et ne l'affiche qu'avec une
 * Notification Service Extension dans l'app, sinon texte seul.
 *
 * `sender` (optionnel, `helpers/shopSender.js`) : boutique expéditrice
 * `{ id, name, imageUrl }`. L'app affiche alors son logo en avatar.
 */
const sendPushNotification = async ({ token, tokens, apnsTokens, title, body, data = {}, imageUrl, sender }) => {
  // === Branche legacy: 1 token unique ===
  if (token && !tokens && !apnsTokens) {
    return sendSingleToken({ token, title, body, data, imageUrl, sender });
  }

  const fcmList = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  const apnsList = Array.isArray(apnsTokens) ? apnsTokens.filter(Boolean) : [];

  const results = { fcm: null, apns: null, tokensToDelete: [] };

  // === APNs (iOS direct) ===
  if (apnsList.length > 0) {
    results.apns = await sendApnsPush({ tokens: apnsList, title, body, data, imageUrl, sender });
    if (results.apns.tokensToDelete) {
      results.tokensToDelete.push(...results.apns.tokensToDelete);
    }
  }

  // === FCM (Android via Firebase Admin) ===
  if (fcmList.length > 0) {
    const fcmResults = await Promise.all(fcmList.map(tok => sendSingleToken({ token: tok, title, body, data, imageUrl, sender })));
    results.fcm = {
      success: fcmResults.every(r => r.success),
      details: fcmResults,
    };
    // Identifier les tokens FCM invalides
    fcmResults.forEach((r, idx) => {
      if (!r.success && r.error) {
        const msg = r.error || '';
        if (msg.includes('registration-token-not-registered') || msg.includes('Requested entity was not found') || msg.includes('invalid-registration-token')) {
          results.tokensToDelete.push(fcmList[idx]);
        }
      }
    });
  }

  return { success: true, ...results };
};

const ANDROID_CHANNEL = 'high_priority_channel';

/**
 * Message FCM d'une boutique expéditrice : DATA SEULES, sans bloc
 * `notification`. Avec ce bloc, Android affiche lui-même la notification app
 * fermée, sans jamais passer par l'app — impossible d'y mettre le logo en
 * avatar. En data seules, l'app construit la notification (expo-notifications
 * lit `title` / `message` / `channelId`, le module `notification-style`
 * la met en conversation avec `sender*`).
 *
 * ⚠️ `android.priority: 'high'` obligatoire : un message data seul part en
 * priorité normale par défaut, retardé tant que le téléphone dort (Doze).
 * Une version de l'app sans le module affiche une notification classique
 * (sans l'image, que seul le bloc `notification` portait).
 */
const conversationMessage = ({ token, title, body, data, imageUrl, sender }) => ({
  token,
  data: {
    ...data,
    title: title || '',
    message: body || '',
    channelId: ANDROID_CHANNEL,
    senderId: sender.id,
    senderName: sender.name,
    senderImageUrl: sender.imageUrl,
    ...(imageUrl ? { imageUrl } : {}),
  },
  android: { priority: 'high' },
});

/**
 * Envoi d'un token unique (FCM natif ou Expo Push). Garde la compatibilité
 * avec les anciens appels qui passent juste { token, title, body, data }.
 */
const sendSingleToken = async ({ token, title, body, data = {}, imageUrl, sender }) => {
  const shortToken = String(token).substring(0, 40) + '...';

  if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
    console.log(`\nEXPO PUSH → ${shortToken}`);
    console.log(`   Title: "${title}" | Body: "${body}"`);
    const result = await sendExpoPushNotification({ token, title, body, data });
    if (result.success) {
      console.log(`   ✅ EXPO OK → response_id=${result.responseId}`);
    } else {
      console.log(`   ❌ EXPO FAIL → ${result.error}`);
    }
    return result;
  }

  console.log(`\nFCM NATIVE → ${shortToken}`);
  console.log(`   Title: "${title}" | Body: "${body}"`);

  const message = sender ? conversationMessage({ token, title, body, data, imageUrl, sender }) : {
    token,
    notification: imageUrl ? { title, body, imageUrl } : { title, body },
    android: {
      notification: {
        channelId: ANDROID_CHANNEL,
        // `notification_icon` (silhouette blanche generee par expo-notifications),
        // PAS `ic_launcher` : Android ne garde que l'alpha de l'icone de notif, et
        // ic_launcher etant opaque partout, elle s'affichait en rond gris uni des
        // que l'app etait fermee (app ouverte, c'est le JS qui affiche et prend
        // deja le bon drawable).
        icon: 'notification_icon',
        sound: 'default',
      },
    },
    data,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`   ✅ FCM OK → response=${response}`);
    return { success: true, response };
  } catch (error) {
    console.log(`   ❌ FCM FAIL → ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = sendPushNotification;
