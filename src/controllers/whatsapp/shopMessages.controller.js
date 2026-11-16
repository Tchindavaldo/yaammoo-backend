// Messages d'une boutique WhatsApp au client connecté (agent IA) : liste et réponse.
// Routes : routes/shopMessageRoutes.js. Doc : architecture/whatsapp-ai.md.
const { listForUser, answer } = require('../../services/whatsapp/ai/clientMessages.service');
const { validateShopMessageAnswer, validateShopMessageQuery } = require('../../utils/validator/validateShopMessage');

exports.listShopMessagesController = async (req, res) => {
  try {
    const errors = validateShopMessageQuery(req.query);
    if (errors.length) return res.status(400).json({ success: false, message: errors[0].message, errors });
    const data = await listForUser(req.user.uid, req.query.orderId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('❌ [WHATSAPP] GET /shop-messages', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.answerShopMessageController = async (req, res) => {
  try {
    const errors = validateShopMessageAnswer(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: errors[0].message, errors });
    const r = await answer(req.params.id, req.user.uid, String(req.body.answer).trim());
    if (!r.success) return res.status(r.httpStatus || 400).json({ success: false, message: r.message });
    return res.status(200).json({ success: true, data: r.data });
  } catch (error) {
    console.error('❌ [WHATSAPP] POST /shop-messages/:id/answer', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
