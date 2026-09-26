// ============================================================================
// Notifications boutique — GET/POST /notification/broadcast/:fastFoodId
// ============================================================================
// Gardes en amont (route) : `firebaseAuth` + `requireFastfoodPermission
// ('notifications.send')`. Ici : validation du payload, puis service.
// ============================================================================
const { validateBroadcast } = require('../../../utils/validator/validateBroadcast');
const { getBroadcastState, sendBroadcast } = require('../../../services/notification/broadcast/broadcast.service');

const reply = (res, result) =>
  result.status < 300
    ? res.status(result.status).json({ success: true, data: result.data })
    : res.status(result.status).json({ success: false, message: result.message });

exports.getBroadcastStateController = async (req, res) => {
  try {
    return reply(res, await getBroadcastState(req.params.fastFoodId));
  } catch (error) {
    console.error('getBroadcastState:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendBroadcastController = async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateBroadcast(payload);
    if (errors.length > 0) return res.status(400).json({ success: false, message: errors });

    return reply(
      res,
      await sendBroadcast({ fastFoodId: req.params.fastFoodId, senderUid: req.user.uid, payload })
    );
  } catch (error) {
    console.error('sendBroadcast:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
