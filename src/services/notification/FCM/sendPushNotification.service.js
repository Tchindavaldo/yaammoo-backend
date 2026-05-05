// services/sendPushNotification.js

const { admin } = require('../../../config/firebase');
const sendExpoPushNotification = require('./sendExpoPushNotification.service');

const sendPushNotification = async ({ token, title, body, data = {} }) => {
  const shortToken = token.substring(0, 40) + '...';

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
    notification: {
      title,
      body,
    },
    android: {
      notification: {
        channelId: 'high_priority_channel',
        icon: 'ic_launcher',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
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
