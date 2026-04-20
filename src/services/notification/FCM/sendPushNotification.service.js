// services/sendPushNotification.js

const { admin } = require('../../../config/firebase');
const sendExpoPushNotification = require('./sendExpoPushNotification.service');

const sendPushNotification = async ({ token, title, body, data = {} }) => {
  if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
    return sendExpoPushNotification({ token, title, body, data });
  }

  const message = {
    token,
    notification: {
      title,
      body,
    },
    android: {
      // priority: 'high',
      notification: {
        channelId: 'high_priority_channel',
        icon: 'ic_launcher',
        sound: 'default',
        // tag: 'group_id', // identifiant pour grouper les notifs
        // group: 'group_id', // identifiant de groupe
        // groupSummary: false,
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
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = sendPushNotification;
