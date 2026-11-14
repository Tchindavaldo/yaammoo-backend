const { openPaidGroups } = require('../../services/order/paidDeliveryGroups.service');

/**
 * GET /order/delivery-group/:userId?fastFoodId&zone&type&date&time
 * Le client a-t-il déjà payé une commande pour ce départ, pas encore partie ?
 * Oui => la course de sa nouvelle commande est offerte (groupage).
 */
exports.getDeliveryGroup = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fastFoodId, zone, type, date, time } = req.query;
    if (!fastFoodId || !zone || !type || !date) {
      return res.status(400).json({ success: false, message: 'fastFoodId, zone, type et date requis.' });
    }
    const probe = { fastFoodId, delivery: { status: true, zone, type, date, time: type === 'time' ? time : undefined } };
    const found = (await openPaidGroups(userId, [probe])).values().next().value || null;
    return res.status(200).json({ success: true, data: { grouped: !!found, orderId: found?.orderId ?? null } });
  } catch (error) {
    console.error('[getDeliveryGroup]', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la vérification du groupage.', error: error.message });
  }
};
