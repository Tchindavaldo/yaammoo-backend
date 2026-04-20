const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const sendExpoPushNotification = async ({ token, title, body, data = {} }) => {
  const message = {
    to: token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'high_priority_channel',
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const json = await res.json();
    const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;

    if (ticket?.status === 'error') {
      return {
        success: false,
        error: ticket.message,
        details: ticket.details,
      };
    }

    return { success: true, response: ticket };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = sendExpoPushNotification;
