// services/sendPushNotification.js

const { admin } = require('../../../config/firebase');

const sendPushNotification = async ({ token, title, body, data = {} }) => {
  const message = { token, notification: { title, body }, data };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = sendPushNotification;
