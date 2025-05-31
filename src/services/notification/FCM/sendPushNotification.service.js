// services/sendPushNotification.js

const { admin } = require('../../../config/firebase');

const sendPushNotification = async ({ token, title, body, data = {} }) => {
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
