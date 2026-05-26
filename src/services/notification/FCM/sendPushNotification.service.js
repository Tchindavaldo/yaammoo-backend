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
 */
const sendPushNotification = async ({ token, tokens, apnsTokens, title, body, data = {} }) => {
  // === Branche legacy: 1 token unique ===
  if (token && !tokens && !apnsTokens) {
    return sendSingleToken({ token, title, body, data });
  }

  const fcmList = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  const apnsList = Array.isArray(apnsTokens) ? apnsTokens.filter(Boolean) : [];

  const results = { fcm: null, apns: null, tokensToDelete: [] };

  // === APNs (iOS direct) ===
  if (apnsList.length > 0) {
    results.apns = await sendApnsPush({ tokens: apnsList, title, body, data });
    if (results.apns.tokensToDelete) {
      results.tokensToDelete.push(...results.apns.tokensToDelete);
    }
  }

  // === FCM (Android via Firebase Admin) ===
  if (fcmList.length > 0) {
    const fcmResults = await Promise.all(
      fcmList.map((tok) => sendSingleToken({ token: tok, title, body, data })),
    );
    results.fcm = {
      success: fcmResults.every((r) => r.success),
      details: fcmResults,
    };
    // Identifier les tokens FCM invalides
    fcmResults.forEach((r, idx) => {
      if (!r.success && r.error) {
        const msg = r.error || '';
        if (
          msg.includes('registration-token-not-registered') ||
          msg.includes('Requested entity was not found') ||
          msg.includes('invalid-registration-token')
        ) {
          results.tokensToDelete.push(fcmList[idx]);
        }
      }
    });
  }

  return { success: true, ...results };
};

/**
 * Envoi d'un token unique (FCM natif ou Expo Push). Garde la compatibilité
 * avec les anciens appels qui passent juste { token, title, body, data }.
 */
const sendSingleToken = async ({ token, title, body, data = {} }) => {
  const shortToken = String(token).substring(0, 40) + '...';

  if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
    console.log(`\n🟠 EXPO PUSH → ${shortToken}`);
    console.log(`   Title: "${title}" | Body: "${body}"`);
    const result = await sendExpoPushNotification({ token, title, body, data });
    if (result.success) {
      console.log(`   ✅ EXPO OK → response_id=${result.responseId}`);
    } else {
      console.log(`   ❌ EXPO FAIL → ${result.error}`);
    }
    return result;
  }

  console.log(`\n🔵 FCM NATIVE → ${shortToken}`);
  console.log(`   Title: "${title}" | Body: "${body}"`);

  const message = {
    token,
    notification: { title, body },
    android: {
      notification: {
        channelId: 'high_priority_channel',
        icon: 'ic_launcher',
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
