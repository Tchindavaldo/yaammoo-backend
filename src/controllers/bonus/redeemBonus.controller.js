const { redeemBonusService } = require('../../services/bonus/redeemBonus.service');

exports.redeemBonusController = async (req, res) => {
  try {
    const userId = req.user?.uid;
    const { code, orderId } = req.body || {};
    const result = await redeemBonusService(userId, code, { orderId });
    const { status = result.success ? 200 : 400, ...body } = result;
    return res.status(status).json(body);
  } catch (error) {
    console.error('Erreur consommation bonus :', error);
    return res.status(500).json({ success: false, message: error.message || 'Erreur serveur lors de la consommation.' });
  }
};
