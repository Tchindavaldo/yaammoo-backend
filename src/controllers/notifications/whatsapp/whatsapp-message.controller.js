const { postSmsWhatsapp } = require('../../../services/notification/whatsapp/post-sms.service');

exports.postWhatsappMessageController = async (req, res) => {
  try {
    const result = await postSmsWhatsapp(); // attends la fin
    res.status(200).json({ success: true, messageSid: result.sid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
